# Verwendete Bibliotheken
library(minfi)
library(jsonlite)


# Bead Count / Detection QC (biologisch sinnvoll als Probe-Failure Rate)
beadcount_safe <- function(raw_data) {
  cat("Starte BeadCount-Filter\n")
  tryCatch({
    det_p <- detectionP(raw_data)
    # Standard QC in Methylation-Analysen:
    # Probe wird entfernt, wenn sie in >10% der Samples schlecht detektiert ist
    failed <- rownames(det_p)[
      apply(det_p, 1, function(x) mean(x > 0.01, na.rm = TRUE) > 0.10)
    ]
    return(failed)
  }, error = function(e) {
    warning("BeadCount fehlgeschlagen: ", conditionMessage(e))
    return(character(0))
  })
}

# JSON Progress Emitter
emit_progress <- function(progress, step, before = NULL, after = NULL, removed = NULL) {
  msg <- list(progress = progress, step = step)
  if (!is.null(before))  msg$before  <- before
  if (!is.null(after))   msg$after   <- after
  if (!is.null(removed)) msg$removed <- removed
  cat(toJSON(msg, auto_unbox = TRUE), "\n")
  flush.console()
}

assert_probes_remain <- function(n, step_name) {
  if (n == 0L) {
    stop(
      "FEHLER: Keine Probes nach Schritt '", step_name, "' übrig!\n",
      "Bitte Filterparameter oder Eingabedaten prüfen."
    )
  }
}

# Filtern von Daten
filter_raw_data <- function(raw_data, job_dir  = ".", save_rds = TRUE, steps    = c("detP", "beadcount", "non_cpg", "snp", "multi_hit")) {
  if (!inherits(raw_data, c("RGChannelSet", "RGChannelSetExtended"))) {
    stop("FEHLER:\n","raw_data muss ein RGChannelSet sein!\n","Aktuelle Klasse: ",paste(class(raw_data), collapse = ", "))
  }
  total_start <- nrow(raw_data)
  cat("Starte Filterung mit", total_start, "Probes\n")
  flush.console()
  remove_set <- character(0)
  
  # 1 Detection P-value
  if ("detP" %in% steps) {
    emit_progress(30, "Detection P-Value")
    det_p <- detectionP(raw_data)
    failed_detP <- rownames(det_p)[
      apply(det_p, 1, function(x) any(x > 0.01, na.rm = TRUE))
    ]
    
    before_detP  <- length(remove_set)
    remove_set   <- union(remove_set, failed_detP)
    removed_detP <- length(remove_set) - before_detP
    emit_progress(35,"Detection P-Value",before  = total_start, after   = total_start - length(remove_set), removed = removed_detP)
  }
  
  # 2 BeadCount
  if ("beadcount" %in% steps) {
    emit_progress(40, "Bead Count")
    failed_bc <- beadcount_safe(raw_data)
    before_bc  <- length(remove_set)
    remove_set <- union(remove_set, failed_bc)
    removed_bc <- length(remove_set) - before_bc
    emit_progress(50, "Bead Count", before  = total_start, after   = total_start - length(remove_set), removed = removed_bc)
  }
  keep <- setdiff(rownames(raw_data), remove_set)
  assert_probes_remain(length(keep), "Pre-QC")
  raw_data_filtered <- raw_data[keep, ]
  if (!inherits(raw_data_filtered, c("RGChannelSet", "RGChannelSetExtended"))) {
    stop(
      "Subset hat RGChannelSet zerstört!\n",
      "Neue Klasse: ",
      paste(class(raw_data_filtered), collapse = ", ")
    )
  }
  
  # Preprocessing
  emit_progress(60, "Preprocessing")
  preprocessed <- preprocessRaw(raw_data_filtered)
  beta         <- getBeta(preprocessed)
  assert_probes_remain(nrow(beta), "Preprocessing")
  ann <- tryCatch(getAnnotation(preprocessed), error = function(e) NULL)
  
  # 4 Non-CpG Filter 
  if ("non_cpg" %in% steps) {
    emit_progress(70, "Non-CpG")
    before_non_cpg <- nrow(beta)
    if (!is.null(ann)) {
      non_cpg <- rownames(ann)[grepl("^ch\\.", rownames(ann))]
      beta    <- beta[!rownames(beta) %in% non_cpg, , drop = FALSE]
    }
    assert_probes_remain(nrow(beta), "Non-CpG")
    emit_progress(75, "Non-CpG", before  = total_start, after   = nrow(beta), removed = before_non_cpg - nrow(beta))
  }
  
  # 5 SNP Filter
  if ("snp" %in% steps) {
    emit_progress(80, "SNP")
    before_snp <- nrow(beta)
    if (!is.null(ann)) {
      failed_snp <- rownames(ann)[
        (!is.na(ann$CpG_maf)   & ann$CpG_maf   >= 0.05) |
          (!is.na(ann$SBE_maf)   & ann$SBE_maf   >= 0.05) |
          (!is.na(ann$Probe_maf) & ann$Probe_maf >= 0.05)
      ]
      beta <- beta[!rownames(beta) %in% failed_snp, , drop = FALSE]
    }
    assert_probes_remain(nrow(beta), "SNP")
    emit_progress(85,"SNP",before  = total_start,after   = nrow(beta),removed = before_snp - nrow(beta))
  }
  
  # 6 Multi-Hit
  if ("multi_hit" %in% steps) {
    emit_progress(90, "Multi-Hit")
    before_mh <- nrow(beta)
    mh_file <- file.path(job_dir, "multi_hit_probes.txt")
    if (file.exists(mh_file)) {
      mh <- trimws(readLines(mh_file))
      mh <- mh[nchar(mh) > 0]
      beta <- beta[!rownames(beta) %in% mh, , drop = FALSE]
    } else {
      message("Multi-Hit-Datei nicht gefunden: ", mh_file, " – Schritt übersprungen.")
    }
    assert_probes_remain(nrow(beta), "Multi-Hit")
    emit_progress(92, "Multi-Hit",before  = total_start,after   = nrow(beta), removed = before_mh - nrow(beta))
  }
  
  # Speichern
  emit_progress(95, "Saving")
  if (save_rds) {
    out_path <- file.path(job_dir, "filtered_data.rds")
    saveRDS(beta, out_path)
    cat("Gespeichert unter:", out_path, "\n")
    flush.console()
  }
  
  
  emit_progress(100,"DONE",before  = total_start,after   = nrow(beta),removed = total_start - nrow(beta))
  
  return(beta)
}