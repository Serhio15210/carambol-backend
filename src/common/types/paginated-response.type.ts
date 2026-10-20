export type PaginatedResponse<T> = {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export const paginate = <T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> => ({
  items,
  meta: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  },
});
