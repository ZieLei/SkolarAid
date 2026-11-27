using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IskolarAid.Data.Migrations
{
    /// <inheritdoc />
    public partial class PaymentPeriodRangeAndProfilePictures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "period_end",
                table: "payments",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "period_start",
                table: "payments",
                type: "date",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "profile_pictures",
                columns: table => new
                {
                    user_id = table.Column<int>(type: "int", nullable: false),
                    data = table.Column<byte[]>(type: "longblob", nullable: false),
                    content_type = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_profile_pictures", x => x.user_id);
                    table.ForeignKey(
                        name: "FK_profile_pictures_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "profile_pictures");

            migrationBuilder.DropColumn(
                name: "period_end",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "period_start",
                table: "payments");
        }
    }
}
