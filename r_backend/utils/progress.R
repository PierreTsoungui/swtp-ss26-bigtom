# ── Progress & Logging Utilities ─────────────────────────────────────────────

#' Sendet einen Progress-Event als JSON an stdout.
#' Wird vom Backend (Python) live ausgelesen.
#'
#' @param percent Fortschritt in Prozent (0-100).
#' @param message Beschreibung des aktuellen Schritts.
emit_progress <- function(percent, message) {
  cat(jsonlite::toJSON(
    list(
      type    = "progress", 
      percent = as.integer(percent), 
      message = as.character(message) # Entspricht exakt der Spezifikation
    ),
    auto_unbox = TRUE
  ), "\n")
  flush.console()
}

#' Sendet einen Fehler als JSON an stdout und beendet das Script sauber aber hart.
#'
#' @param message Fehlermeldung als character.
emit_error <- function(message) {
  cat(jsonlite::toJSON(
    list(
      type    = "error", 
      message = as.character(message)
    ),
    auto_unbox = TRUE
  ), "\n")
  flush.console()
  
  # Beendet R sofort ohne zusätzliche System-Fehlermeldungen zu loggen
  quit(save = "no", status = 1) 
}

#' Sendet ein Done-Event wenn das Script erfolgreich abgeschlossen ist.
#'
#' @param ... Beliebige zusätzliche Felder als named arguments.
emit_done <- function(...) {
  msg <- c(list(type = "done"), list(...))
  cat(jsonlite::toJSON(msg, auto_unbox = TRUE), "\n")
  flush.console()
}