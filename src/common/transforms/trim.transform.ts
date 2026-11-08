// For @Transform(): trims strings before validation, leaves any other value untouched.
export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
