import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Shows all available commands");

export async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setTitle("📜 Bot Commands")
    .setDescription(
      `
    🏓 /ping — Test the bot
    ⏰ /remind — Set a reminder
    👢 /kick — Kick a member
    🔨 /ban — Ban a member
    ❓ /help — Show this menu
    `,
    )
    .setColor("Blue");
  await interaction.reply({ embeds: [embed] });
}
