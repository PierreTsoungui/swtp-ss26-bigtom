export const getFileDisplayName = (file: File): string =>
  file.webkitRelativePath || file.name;

export const getFileIdentity = (file: File): string =>
  `${getFileDisplayName(file)}:${file.size}:${file.lastModified}`;
