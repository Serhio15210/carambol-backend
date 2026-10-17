export class HealthStatusModel {
  constructor(
    public readonly service: string,
    public readonly status: 'ok',
    public readonly timestamp: string,
  ) {}
}
