import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { Auth } from '@/entities/auth/decorators/auth.decorator';
import { CurrentUser } from '@/entities/auth/decorators/current-user.decorator';
import { RequestUser } from '@/entities/users/interfaces/user.interface';
import { UserRole } from '@/entities/users/model/user.entity';
import { SelectTariffDto } from '@/entities/tariffs/dto/select-tariff.dto';
import { TariffsService } from '@/entities/tariffs/service/tariffs.service';

@Controller('tariffs')
export class TariffsController {
  constructor(private readonly tariffsService: TariffsService) {}

  @Get()
  getActiveTariffs() {
    return this.tariffsService.getActiveTariffs();
  }

  @Auth(UserRole.ADMIN, UserRole.USER)
  @Get('my')
  getMyActiveTariff(@CurrentUser() user: RequestUser) {
    return this.tariffsService.getMyActiveTariff(user.id);
  }

  @Auth(UserRole.ADMIN, UserRole.USER)
  @Post('select')
  selectTariff(@CurrentUser() user: RequestUser, @Body() body: SelectTariffDto) {
    return this.tariffsService.selectTariff(user.id, body.tariffId);
  }

  @Auth(UserRole.ADMIN, UserRole.USER)
  @Patch('change')
  changeTariff(@CurrentUser() user: RequestUser, @Body() body: SelectTariffDto) {
    return this.tariffsService.changeTariff(user.id, body.tariffId);
  }
}
