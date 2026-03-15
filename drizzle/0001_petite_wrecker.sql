CREATE TABLE `arvores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`localId` varchar(64) NOT NULL,
	`nomeCientifico` varchar(255),
	`descricao` text,
	`fotoUrl` text,
	`latitude` decimal(10,7) NOT NULL,
	`longitude` decimal(10,7) NOT NULL,
	`irqValor` decimal(10,2),
	`irqClassificacao` varchar(20),
	`irqParametros` text,
	`pinColor` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `arvores_id` PRIMARY KEY(`id`),
	CONSTRAINT `arvores_localId_unique` UNIQUE(`localId`)
);
--> statement-breakpoint
CREATE TABLE `regioes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`localId` varchar(64) NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`descricao` text,
	`fotoUrl` text,
	`coordenadas` text NOT NULL,
	`centroLat` decimal(10,7),
	`centroLng` decimal(10,7),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `regioes_id` PRIMARY KEY(`id`),
	CONSTRAINT `regioes_localId_unique` UNIQUE(`localId`)
);
