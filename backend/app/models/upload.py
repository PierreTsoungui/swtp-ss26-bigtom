# app/models/upload.py
"""Request/response models for the upload step (legacy single-shot + inspect/commit)."""
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.models.filter import FilterSettings


class UploadResponse(BaseModel):
    """Acknowledgement returned after a successful upload.

    ``filter_settings`` echoes the effective (validated) filter configuration
    back to the client.
    """

    job_id:          str
    status:          str
    filter_settings: dict


# ── Folder / ZIP upload: inspect → commit ─────────────────────────────────────

class FileEntry(BaseModel):
    """A single staged file."""

    name:       str
    rel_path:   str
    size_bytes: int


class SuggestedMapping(BaseModel):
    """Best-effort role → raw-column guess used to pre-fill the role dropdowns.

    Every field is optional: a role is only filled when a confident alias match
    exists, otherwise the user picks it manually.
    """

    sentrix_id:       Optional[str] = None
    sentrix_position: Optional[str] = None
    sample_group:     Optional[str] = None
    sample_name:      Optional[str] = None


class SampleSheetCandidate(BaseModel):
    """A recognized sample sheet the user can choose from.

    ``columns`` are the *raw* column names exactly as they appear in the sheet —
    the options for the four role dropdowns. ``suggested_mapping`` pre-fills those
    dropdowns where a column could be recognized automatically.
    """

    id:                str
    name:              str
    rel_path:          str
    size_bytes:        int
    recognized:        bool = True
    recommended:       bool = False
    sample_count:      Optional[int] = None
    columns:           list[str] = Field(default_factory=list)
    suggested_mapping: SuggestedMapping = Field(default_factory=SuggestedMapping)


class IdatPair(BaseModel):
    """A Grn/Red IDAT pair (one sample). ``complete`` iff both channels exist."""

    pair_id:  str
    grn:      Optional[FileEntry] = None
    red:      Optional[FileEntry] = None
    complete: bool


class OtherFile(BaseModel):
    """A real file that was found but not used (unsupported / unrecognized)."""

    name:     str
    rel_path: str
    reason:   str


class ManifestError(BaseModel):
    """A non-fatal, UI-blocking condition (e.g. more than one sample sheet)."""

    code:    str
    message: str


class InspectManifest(BaseModel):
    """Result of inspecting an upload: everything found, classified by role."""

    session_id:    str
    source:        str  # "zip" | "files"
    sample_sheets: list[SampleSheetCandidate] = Field(default_factory=list)
    idats:         list[IdatPair] = Field(default_factory=list)
    other_files:   list[OtherFile] = Field(default_factory=list)
    errors:        list[ManifestError] = Field(default_factory=list)
    expires_at:    str


class ColumnMapping(BaseModel):
    """User's explicit assignment of the four canonical roles to raw columns.

    All four are required (the UI only enables Start once every role is chosen)
    and must reference four *distinct* columns of the selected sheet — the same
    column cannot serve two roles. The values are raw column names taken from the
    chosen sheet's ``columns``.
    """

    sentrix_id:       str
    sentrix_position: str
    sample_group:     str
    sample_name:      str

    @model_validator(mode="after")
    def _roles_must_be_distinct(self) -> "ColumnMapping":
        chosen = [self.sentrix_id, self.sentrix_position, self.sample_group, self.sample_name]
        if len(set(chosen)) != len(chosen):
            raise ValueError("Each column may be assigned to only one role.")
        return self

    def as_role_dict(self) -> dict[str, str]:
        """Return ``canonical role name -> raw column`` for the normalizer."""
        return {
            "Sentrix_ID":       self.sentrix_id,
            "Sentrix_Position": self.sentrix_position,
            "Sample_Group":     self.sample_group,
            "Sample_Name":      self.sample_name,
        }


class CommitRequest(BaseModel):
    """The user's confirmed selection, sent to start the pipeline."""

    session_id:               str
    selected_sample_sheet_id: str
    selected_pair_ids:        list[str] = Field(default_factory=list)
    column_mapping:           ColumnMapping
    filter_settings:          FilterSettings = Field(default_factory=FilterSettings)


class SheetPreview(BaseModel):
    """A small tabular preview of a candidate sample sheet."""

    sheet_id:   str
    columns:    list[str]
    rows:       list[list[str]]
    total_rows: int
    truncated:  bool
