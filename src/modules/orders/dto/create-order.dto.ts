import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsUUID,
  Matches,
} from 'class-validator';

// shortcut: a flat limit; make it a club setting when a club needs more.
export const MAX_TABLES_PER_ORDER = 5;

// The times are INSTANTS, so the offset is mandatory ("2030-01-07T12:00:00+02:00" or "...Z"):
// without it JavaScript would read the text in the SERVER's time zone (lesson 16).
const WITH_OFFSET = /(Z|[+-]\d{2}:\d{2})$/;

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_TABLES_PER_ORDER)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tableIds: string[];

  @Matches(WITH_OFFSET, { message: 'startsAt must end with Z or an offset like +02:00' })
  @IsISO8601({ strict: true })
  startsAt: string;

  @Matches(WITH_OFFSET, { message: 'endsAt must end with Z or an offset like +02:00' })
  @IsISO8601({ strict: true })
  endsAt: string;
}
