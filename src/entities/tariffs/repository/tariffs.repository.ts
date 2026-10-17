import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { TariffEntity, TariffStatus } from '@/entities/tariffs/model/tariff.entity';
import { UserTariffEntity, UserTariffStatus } from '@/entities/tariffs/model/user-tariff.entity';
import { CreateTariffDto } from '@/entities/tariffs/dto/create-tariff.dto';
import { UpdateTariffDto } from '@/entities/tariffs/dto/update-tariff.dto';

@Injectable()
export class TariffsRepository {
  constructor(
    @InjectRepository(TariffEntity)
    private readonly tariffRepository: Repository<TariffEntity>,
    @InjectRepository(UserTariffEntity)
    private readonly userTariffRepository: Repository<UserTariffEntity>,
  ) {}

  findActiveTariffs(): Promise<TariffEntity[]> {
    return this.tariffRepository.find({
      where: { status: TariffStatus.ACTIVE },
      order: { price: 'ASC' },
    });
  }

  findAllTariffs(): Promise<TariffEntity[]> {
    return this.tariffRepository.find({ order: { createdAt: 'DESC' } });
  }

  findTariffById(id: string): Promise<TariffEntity | null> {
    return this.tariffRepository.findOne({ where: { id } });
  }

  createTariff(data: CreateTariffDto): TariffEntity {
    return this.tariffRepository.create(data);
  }

  mergeTariff(tariff: TariffEntity, data: UpdateTariffDto): TariffEntity {
    return this.tariffRepository.merge(tariff, data);
  }

  saveTariff(tariff: TariffEntity): Promise<TariffEntity> {
    return this.tariffRepository.save(tariff);
  }

  findActiveUserTariff(userId: string): Promise<UserTariffEntity | null> {
    return this.userTariffRepository.findOne({
      where: {
        userId,
        status: UserTariffStatus.ACTIVE,
      },
      relations: { tariff: true },
      order: { createdAt: 'DESC' },
    });
  }

  createUserTariff(data: {
    userId: string;
    tariffId: string;
    pricePaid: number;
    startsAt: Date;
    expiresAt: Date;
  }): UserTariffEntity {
    return this.userTariffRepository.create(data);
  }

  saveUserTariff(userTariff: UserTariffEntity): Promise<UserTariffEntity> {
    return this.userTariffRepository.save(userTariff);
  }

  async cancelActiveUserTariffs(userId: string): Promise<void> {
    await this.userTariffRepository.update(
      { userId, status: UserTariffStatus.ACTIVE },
      { status: UserTariffStatus.CANCELED },
    );
  }

  async expireFinishedUserTariffs(now: Date): Promise<void> {
    await this.userTariffRepository.update(
      {
        status: UserTariffStatus.ACTIVE,
        expiresAt: LessThanOrEqual(now),
      },
      { status: UserTariffStatus.EXPIRED },
    );
  }
}
