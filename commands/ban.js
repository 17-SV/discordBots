import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Ban a member from the server")
  .addUserOption((opt) =>
    opt.setName("target").setDescription("User to ban").setRequired(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export async function execute(interaction) {
  const user = interaction.options.getUser("target");
  await interaction.guild.members.ban(user.id);
  await interaction.reply(`🔨 ${user.tag} was banned.`);
}
