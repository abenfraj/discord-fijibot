require("dotenv").config();
const fs = require("fs");
const express = require("express");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 3000;

// Keep Render web service active
app.get("/", (req, res) => {
    res.send("Bot is running...");
});
app.listen(PORT, () => console.log(`🌍 Web server running on port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const CHAT_CHANNEL_ID = process.env.CHAT_CHANNEL_ID;

const playersData = JSON.parse(fs.readFileSync("players.json", "utf8"));
const messagesList = JSON.parse(fs.readFileSync("messages.json", "utf8"));

client.once("ready", () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
    setInterval(checkAllRaidEvents, 30 * 60 * 1000); // Runs every 30 minutes
});

// Fetch all messages and check events
async function checkAllRaidEvents() {
    try {
        const targetChannel = await client.channels.fetch(TARGET_CHANNEL_ID);
        const chatChannel = await client.channels.fetch(CHAT_CHANNEL_ID);
        if (!targetChannel || !chatChannel) return;

        const messages = await targetChannel.messages.fetch({ limit: 50 }); // Fetch more messages
        const eventMessages = messages.filter(msg => msg.embeds.length > 0);

        for (const eventMessage of eventMessages.values()) {
            await processRaidEvent(eventMessage, chatChannel);
        }
    } catch (error) {
        console.error("Erreur lors de la récupération des messages :", error);
    }
}

// Process each raid event
async function processRaidEvent(eventMessage, chatChannel) {
    try {
        const embed = eventMessage.embeds[0];

        // Extract unknown players
        const unknownFields = embed.fields.filter(field =>
            field.name.toLowerCase().includes("unknown") || field.name.trim() === "" || field.name === "​"
        );
        if (!unknownFields.length) return;

        const unknownFieldValue = unknownFields.map(field => field.value).join("\n");
        const unknownPlayers = [...unknownFieldValue.matchAll(/<:\w+:\d+> <:\w+:\d+> (\S+)/g)]
            .map(match => match[1]);

        if (!unknownPlayers.length) return;

        const mentions = unknownPlayers
            .map(playerName => {
                const discordId = playersData[playerName];
                return discordId ? `<@${discordId}>` : `**${playerName}**`;
            })
            .join(", ");

        // Extract and format event date
        const dateMatch = embed.title.match(/(\w+day), (\w+) (\d+)/);
        if (!dateMatch) return;

        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"];

        const monthNumber = monthNames.indexOf(dateMatch[2]) + 1;
        const dayNumber = parseInt(dateMatch[3], 10);
        const currentYear = new Date().getFullYear();

        const formattedDate = `${dateMatch[1]} ${dateMatch[2]} (${dayNumber}/${monthNumber.toString().padStart(2, "0")}) - JJ/MM`;

        const raidDateObj = new Date(Date.UTC(currentYear, monthNumber - 1, dayNumber, 20, 45, 0));
        const raidTimestamp = Math.floor(raidDateObj.getTime() / 1000);
        const discordTimestamp = `<t:${raidTimestamp}:R>`;

        const now = Math.floor(Date.now() / 1000);
        const reminderTimestamp = raidTimestamp - 48 * 3600;

        if (now < reminderTimestamp || now > reminderTimestamp + 3600) return;

        const deleteTimestamp = raidTimestamp + 12 * 3600;
        const deleteTimer = `<t:${deleteTimestamp}:R>`;

        const raidUrl = `https://discord.com/channels/${eventMessage.guildId}/${TARGET_CHANNEL_ID}/${eventMessage.id}`;

        const randomMessage = messagesList[
            Math.floor(Math.random() * messagesList.length)
        ]
            .replace("{mentions}", mentions)
            .replace("{date}", formattedDate);

        const embeddedMessage = new EmbedBuilder()
            .setColor("#ffcc00")
            .setTitle(`📢 Rappel RAID 48h - ${formattedDate}`)
            .setDescription(`${randomMessage}`)
            .addFields(
                { name: "⏳ Départ dans", value: `${discordTimestamp}`, inline: true },
                { name: "🗑️ Suppression dans", value: `${deleteTimer}`, inline: true },
                {
                    name: "🔗 Confirmation",
                    value: `[Confirmez votre présence ici](${raidUrl})`,
                    inline: true,
                }
            )
            .setFooter({
                text: "Soyez à l'heure !",
                iconURL: client.user.displayAvatarURL(),
            });

        const sentMessage = await chatChannel.send({ embeds: [embeddedMessage] });

        setTimeout(async () => {
            try {
                await sentMessage.delete();
            } catch (error) {
                console.error("Erreur lors de la suppression du message :", error);
            }
        }, (deleteTimestamp - now) * 1000);

    } catch (error) {
        console.error("Erreur lors du traitement d'un raid :", error);
    }
}

client.login(process.env.DISCORD_TOKEN);

client.on("messageCreate", (message) => {
    if (message.author.bot) return;
    if (message.content === "!ping") {
        message.channel.send("Pong!");
    }
});
