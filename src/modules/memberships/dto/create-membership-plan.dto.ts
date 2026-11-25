import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';
import { trim } from '@/common/transforms/trim.transform';

// The same rules as the CHECKs of membership_plans: here they give the client a clear 400, the
// database keeps them for every other way of writing (our filter has no mapping for a CHECK error).
export class CreateMembershipPlanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(trim)
  name: string;

  // Monthly price in cents: 4000 = 40.00. Stripe refuses less than 0.50.
  @IsInt()
  @Min(50)
  @Max(1_000_000)
  priceCents: number;

  @IsInt()
  @Min(1)
  @Max(100)
  discountPercent: number;
}
