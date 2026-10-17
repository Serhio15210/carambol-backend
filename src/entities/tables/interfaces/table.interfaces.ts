import { TableColor, TableStatus, TableType } from '@/entities/tables/model/table.entity';

export interface TableFindAllFilters {
  name?: string;
  color?: TableColor;
  status?: TableStatus;
  type?: TableType;
  limit: number;
  skip: number;
}
