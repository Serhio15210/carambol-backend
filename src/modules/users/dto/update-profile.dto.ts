import { IsEmail, IsOptional, IsPhoneNumber, IsString, MinLength } from 'class-validator';

// DTO (Data Transfer Object) описывает, какие поля клиент может прислать.
// ValidationPipe проверяет body по этим декораторам ещё ДО вызова контроллера.
// Поля role и passwordHash здесь нет, поэтому изменить их через этот эндпоинт нельзя:
// whitelist вырежет их из body, а forbidNonWhitelisted вернёт 400.
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  userName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;
}
