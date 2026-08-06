export type SyntheticPostgresConfig = {
  host: string
  port: number
  database: string
  user: string
  password: string
}

export function checkedSyntheticPostgresConfig(
  value: string | undefined,
  name: string,
): SyntheticPostgresConfig
