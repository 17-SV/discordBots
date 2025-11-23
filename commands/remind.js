import { SlashCommandBuilder } from "discord.js";
import cron from "node-cron";

export const data = new SlashCommandBuilder()
  .setName("remind")
  .setDescription("Set a reminder")
  .addIntegerOption((opt) =>
    opt
      .setName("minutes")
      .setDescription("Remind me after how many minutes?")
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("message").setDescription("Reminder text").setRequired(true),
  );

export async function execute(interaction) {
  const minutes = interaction.options.getInteger("minutes");
  const msg = interaction.options.getString("message");

  await interaction.reply(`⏰ Reminder set for **${minutes} min**: "${msg}"`);

  setTimeout(
    () => {
      interaction.followUp(`🔔 <@${interaction.user.id}> Reminder: ${msg}`);
    },
    minutes * 60 * 1000,
  );
}
