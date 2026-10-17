import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Auth } from '@/entities/auth/decorators/auth.decorator';
import { UserRole } from '@/entities/users/model/user.entity';
import { CreateTariffDto } from '@/entities/tariffs/dto/create-tariff.dto';
import { UpdateTariffDto } from '@/entities/tariffs/dto/update-tariff.dto';
import { TariffsService } from '@/entities/tariffs/service/tariffs.service';

@Auth(UserRole.ADMIN)
@Controller('admin/tariffs')
export class AdminTariffsController {
  constructor(private readonly tariffsService: TariffsService) {}

  @Get()
  getAllTariffs() {
    return this.tariffsService.getAllTariffs();
  }

  @Post()
  createTariff(@Body() body: CreateTariffDto) {
    return this.tariffsService.createTariff(body);
  }

  @Patch(':id')
  updateTariff(@Param('id') id: string, @Body() body: UpdateTariffDto) {
    return this.tariffsService.updateTariff(id, body);
  }

  @Delete(':id')
  closeTariff(@Param('id') id: string) {
    return this.tariffsService.closeTariff(id);
  }
}
