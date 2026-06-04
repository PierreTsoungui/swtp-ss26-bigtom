export type TableName = "dmp" | "dmr";

export interface TableColumn {
  key: string;
  label: string;
  type: string;
  sortable: boolean;
  filterable: boolean;
}

export interface TableResponse {
  table: string;
  table_title: string;
  description: string;

  columns: TableColumn[];

  data: Record<string, unknown>[];

  pagination: {
    page: number;
    page_size: number;
    total_rows: number;
    total_pages: number;
  };
}