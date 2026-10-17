import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TariffEntity, TariffStatus } from '@/entities/tariffs/model/tariff.entity';
import { CreateTariffDto } from '@/entities/tariffs/dto/create-tariff.dto';
import { UpdateTariffDto } from '@/entities/tariffs/dto/update-tariff.dto';
import { TariffsRepository } from '@/entities/tariffs/repository/tariffs.repository';
import { UserTariffEntity } from '@/entities/tariffs/model/user-tariff.entity';

@Injectable()
export class TariffsService {
  constructor(private readonly tariffsRepository: TariffsRepository) {}

  getActiveTariffs(): Promise<TariffEntity[]> {
    return this.tariffsRepository.findActiveTariffs();
  }

  getAllTariffs(): Promise<TariffEntity[]> {
    return this.tariffsRepository.findAllTariffs();
  }

  createTariff(data: CreateTariffDto): Promise<TariffEntity> {
    const tariff = this.tariffsRepository.createTariff(data);
    return this.tariffsRepository.saveTariff(tariff);
  }

  async updateTariff(id: string, data: UpdateTariffDto): Promise<TariffEntity> {
    const tariff = await this.getTariffOrThrow(id);
    const updatedTariff = this.tariffsRepository.mergeTariff(tariff, data);

    return this.tariffsRepository.saveTariff(updatedTariff);
  }

  async closeTariff(id: string): Promise<TariffEntity> {
    const tariff = await this.getTariffOrThrow(id);

    tariff.status = TariffStatus.CLOSED;

    return this.tariffsRepository.saveTariff(tariff);
  }

  getMyActiveTariff(userId: string): Promise<UserTariffEntity | null> {
    return this.tariffsRepository.findActiveUserTariff(userId);
  }

  async selectTariff(userId: string, tariffId: string): Promise<UserTariffEntity> {
    const activeUserTariff = await this.tariffsRepository.findActiveUserTariff(userId);

    if (activeUserTariff) {
      throw new BadRequestException('User already has active tariff');
    }

    return this.createUserTariff(userId, tariffId);
  }

  async changeTariff(userId: string, tariffId: string): Promise<UserTariffEntity> {
    await this.tariffsRepository.cancelActiveUserTariffs(userId);

    return this.createUserTariff(userId, tariffId);
  }

  expireFinishedUserTariffs(now = new Date()): Promise<void> {
    return this.tariffsRepository.expireFinishedUserTariffs(now);
  }

  private async createUserTariff(userId: string, tariffId: string): Promise<UserTariffEntity> {
    const tariff = await this.getTariffOrThrow(tariffId);

    if (tariff.status !== TariffStatus.ACTIVE) {
      throw new BadRequestException('Tariff is not active');
    }

    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + tariff.validityDays * 24 * 60 * 60 * 1000);
    const pricePaid = tariff.discountPrice ?? tariff.price;
    const userTariff = this.tariffsRepository.createUserTariff({
      userId,
      tariffId,
      pricePaid,
      startsAt,
      expiresAt,
    });

    return this.tariffsRepository.saveUserTariff(userTariff);
  }

  private async getTariffOrThrow(id: string): Promise<TariffEntity> {
    const tariff = await this.tariffsRepository.findTariffById(id);

    if (!tariff) {
      throw new NotFoundException(`Tariff ${id} not found`);
    }

    return tariff;
  }
}
