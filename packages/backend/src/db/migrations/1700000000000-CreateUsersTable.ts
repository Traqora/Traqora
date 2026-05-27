import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateUsersTable1700000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: "users",
                columns: [
                    {
                        name: "walletAddress",
                        type: "varchar",
                        isPrimary: true,
                    },
                    {
                        name: "walletType",
                        type: "enum",
                        enum: ["freighter", "albedo", "rabet"],
                    },
                    {
                        name: "createdAt",
                        type: "timestamp",
                        default: "now()",
                    },
                    {
                        name: "lastLoginAt",
                        type: "timestamp",
                        isNullable: true,
                    },
                ],
            }),
            true,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable("users");
    }
}
