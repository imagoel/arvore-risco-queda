-- Migration 0003: Renomear colunas camelCase → snake_case em todas as tabelas
-- Gerado manualmente para evitar o modo interativo do drizzle-kit generate.
-- O Drizzle ORM usa casing: "snake_case" no construtor, então o JS continua
-- enxergando os campos como camelCase (fotoUrl, localId, etc.) enquanto o
-- MySQL armazena em snake_case (foto_url, local_id, etc.).

-- ─── Tabela: users ────────────────────────────────────────────────────────────
ALTER TABLE `users`
  RENAME COLUMN `openId`       TO `open_id`,
  RENAME COLUMN `loginMethod`  TO `login_method`,
  RENAME COLUMN `createdAt`    TO `created_at`,
  RENAME COLUMN `updatedAt`    TO `updated_at`,
  RENAME COLUMN `lastSignedIn` TO `last_signed_in`;

-- ─── Tabela: arvores ──────────────────────────────────────────────────────────
ALTER TABLE `arvores`
  RENAME COLUMN `localId`          TO `local_id`,
  RENAME COLUMN `nomeCientifico`   TO `nome_cientifico`,
  RENAME COLUMN `fotoUrl`          TO `foto_url`,
  RENAME COLUMN `irqValor`         TO `irq_valor`,
  RENAME COLUMN `irqClassificacao` TO `irq_classificacao`,
  RENAME COLUMN `irqParametros`    TO `irq_parametros`,
  RENAME COLUMN `pinColor`         TO `pin_color`,
  RENAME COLUMN `createdAt`        TO `created_at`,
  RENAME COLUMN `updatedAt`        TO `updated_at`;

-- ─── Tabela: regioes ──────────────────────────────────────────────────────────
ALTER TABLE `regioes`
  RENAME COLUMN `localId`   TO `local_id`,
  RENAME COLUMN `fotoUrl`   TO `foto_url`,
  RENAME COLUMN `centroLat` TO `centro_lat`,
  RENAME COLUMN `centroLng` TO `centro_lng`,
  RENAME COLUMN `createdAt` TO `created_at`,
  RENAME COLUMN `updatedAt` TO `updated_at`;

-- ─── Constraints UNIQUE: precisam ser recriadas com o novo nome de coluna ─────
-- MySQL 8.0: RENAME COLUMN preserva índices, mas a constraint UNIQUE nomeada
-- com o nome antigo precisa ser verificada. Se o nome da constraint incluía
-- o nome da coluna, recriar:
ALTER TABLE `users`    DROP INDEX `users_openId_unique`,
                       ADD UNIQUE KEY `users_open_id_unique` (`open_id`);

ALTER TABLE `arvores`  DROP INDEX `arvores_localId_unique`,
                       ADD UNIQUE KEY `arvores_local_id_unique` (`local_id`);

ALTER TABLE `regioes`  DROP INDEX `regioes_localId_unique`,
                       ADD UNIQUE KEY `regioes_local_id_unique` (`local_id`);
