import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Kick a member from the server")
  .addUserOption((opt) =>
    opt.setName("target").setDescription("User to kick").setRequired(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers);

export async function execute(interaction) {
  const user = interaction.options.getUser("target");
  const member = await interaction.guild.members.fetch(user.id);
  await member.kick();
  await interaction.reply(`👢 ${user.tag} was kicked.`);
}
