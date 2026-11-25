import { IsUUID } from 'class-validator';

// The client chooses a plan from the shop window; the price comes from the plan, never from the client.
export class StartMembershipDto {
  @IsUUID()
  planId: string;
}
