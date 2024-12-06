import Airtable from "airtable";
import fetch from "node-fetch";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI;
const SLACK_AUTH_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access";
const SLACK_HARDCODED_TOKEN = process.env.SLACK_HARDCODED_TOKEN;

let slackToken = SLACK_HARDCODED_TOKEN || null;

var base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

async function getSlackToken() {
  if (slackToken) return slackToken;

  const response = await fetch(SLACK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
      code: process.env.SLACK_OAUTH_CODE,
      redirect_uri: SLACK_REDIRECT_URI,
    }),
  });

  const data = await response.json();

  if (data.ok) {
    slackToken = data.access_token;
    console.log("Slack token:", slackToken);
    return slackToken;
  } else {
    throw new Error("Failed to retrieve Slack token: " + data.error);
  }
}

async function sendSlackMessage(userSlackId, message) {
  const token = await getSlackToken();

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel: userSlackId,
      text: message,
    }),
  });

  const data = await response.json();
  if (!data.ok) {
    console.error("Failed to send message:", data.error);
  }
}

async function matchUsersAndSendMessages() {
  let organizedUsers = {};
  let userRecords = {};

  let allUsers = [];

  base("Users")
    .select({
      view: "View all Signups",
      filterByFormula: "NOT({match})",
    })
    .eachPage(
      function page(records, fetchNextPage) {
        records.forEach(function (record) {
          let region = record.get("region");
          let name = record.get("name");
          let slackId = record.get("Slack ID");
          let addressline1 = record.get("address-line1");
          let addressline2 = record.get("address-line2");
          let city = record.get("address-city");
          let state = record.get("address-state");
          let postal = record.get("address-postal");
          let country = record.get("address-country");
          let likes = record.get("likes");
          let dislikes = record.get("dislikes");

          if (!organizedUsers[region]) {
            organizedUsers[region] = [];
          }
          let user = {
            name,
            slackId,
            addressline1,
            addressline2,
            city,
            state,
            postal,
            country,
            likes,
            dislikes,
            recordId: record.id,
            region,
          };
          organizedUsers[region].push(user);
          allUsers.push(user);
          userRecords[name] = record.id;
        });
        fetchNextPage();
      },
      async function done(err) {
        if (err) {
          console.error(err);
          return;
        }

        let matchedRecords = [];

        for (let region in organizedUsers) {
          let users = organizedUsers[region];
          if (users.length < 2) continue;

          let countryGroups = users.reduce((acc, user) => {
            if (!acc[user.country]) {
              acc[user.country] = [];
            }
            acc[user.country].push(user);
            return acc;
          }, {});

          for (let country in countryGroups) {
            let countryUsers = countryGroups[country];
            if (countryUsers.length < 2) continue;

            let shuffledUsers = countryUsers.slice();
            for (let i = shuffledUsers.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffledUsers[i], shuffledUsers[j]] = [
                shuffledUsers[j],
                shuffledUsers[i],
              ];
            }

            for (let i = 0; i < shuffledUsers.length; i++) {
              let user = shuffledUsers[i];
              let match = shuffledUsers[(i + 1) % shuffledUsers.length];
              matchedRecords.push({ user, match, sameRegion: true });
            }
          }
        }

        for (let region in organizedUsers) {
          let users = organizedUsers[region].filter(
            (user) =>
              !matchedRecords.some(
                (pair) => pair.user === user || pair.match === user
              )
          );
          if (users.length < 2) continue;

          let shuffledUsers = users.slice();
          for (let i = shuffledUsers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledUsers[i], shuffledUsers[j]] = [
              shuffledUsers[j],
              shuffledUsers[i],
            ];
          }

          for (let i = 0; i < shuffledUsers.length; i++) {
            let user = shuffledUsers[i];
            let match = shuffledUsers[(i + 1) % shuffledUsers.length];
            matchedRecords.push({ user, match, sameRegion: true });
          }
        }

        let unmatchedUsers = allUsers.filter(
          (user) =>
            !matchedRecords.some(
              (pair) => pair.user === user || pair.match === user
            )
        );

        if (unmatchedUsers.length >= 2) {
          let shuffledUnmatchedUsers = unmatchedUsers.slice();
          for (let i = shuffledUnmatchedUsers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledUnmatchedUsers[i], shuffledUnmatchedUsers[j]] = [
              shuffledUnmatchedUsers[j],
              shuffledUnmatchedUsers[i],
            ];
          }

          for (let i = 0; i < shuffledUnmatchedUsers.length; i++) {
            let user = shuffledUnmatchedUsers[i];
            let match =
              shuffledUnmatchedUsers[(i + 1) % shuffledUnmatchedUsers.length];
            matchedRecords.push({ user, match, sameRegion: false });
          }
        }

        if (unmatchedUsers.length >= 2) {
          let shuffledUnmatchedUsers = unmatchedUsers.slice();
          for (let i = shuffledUnmatchedUsers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledUnmatchedUsers[i], shuffledUnmatchedUsers[j]] = [
              shuffledUnmatchedUsers[j],
              shuffledUnmatchedUsers[i],
            ];
          }

          for (let i = 0; i < shuffledUnmatchedUsers.length; i++) {
            let user = shuffledUnmatchedUsers[i];
            let match =
              shuffledUnmatchedUsers[(i + 1) % shuffledUnmatchedUsers.length];
            matchedRecords.push({ user, match, sameRegion: false });
          }
        }

        for (let pair of matchedRecords) {
          const user = pair.user;
          const match = pair.match;

          if (user.slackId && match.slackId) {
            try {
              await new Promise((resolve) => setTimeout(resolve, 1000));

              let message;
              if (pair.sameRegion) {
                message = `*Hey ${
                  user.name
                }*, you’ve been matched with somebody for *Secret Santa*! Be sure to send a gift as soon as possible! 🎁\n\n
*Here is who they are!!* :santa:\n
> *${match.name}*\n\n
*Here is where they live* 😊\n
> ${match.addressline1}
${match.addressline2 ? `> ${match.addressline2}\n` : ""}
> ${match.city}, ${match.state} ${match.postal}\n\
> ${match.country}\n\n
*Looks like they like the following:* 💖\n
> ${match.likes}\n\n
*Here’s what they don’t like!* 😱\n
> ${match.dislikes}\n\n
Alright, try and get this shipped out soon, and get ready to receive your own cool gift! Ping <!subteam^SQM1SGJF6|elves> for any questions, and make sure to check out <https://hackclub.slack.com/canvas/CQFS7Q4A1|Secret Santa Rules>.
*If you need your matches phone number for shipping, please reach out to <@U066WR9MNHK>*`;
              } else {
                message = `*Hello ${
                  user.name
                }*, we couldn't find a match in your region, but we've paired you with someone outside your region for *Secret Santa*!\n
*Hack Club HQ will cover your shipping costs due to being an international match*! Please DM <@U0616280E6P> (one of our elves) to arrange the details.
Be sure to send your gift as soon as possible! 🎁\n\n
*Here is your match!* :santa:\n
> *${match.name}*\n\n
*Their address:* 😊\n
> ${match.addressline1}
${match.addressline2 ? `> ${match.addressline2}\n` : ""}
> ${match.city}, ${match.state} ${match.postal}\n\
> ${match.country}\n\n
*They like:* 💖\n
> ${match.likes}\n\n
*They don't like:* 😱\n
> ${match.dislikes}\n\n
Remember, this is an international match, so plan accordingly and ship early. Ping <!subteam^SQM1SGJF6|elves> for any questions, and check out the <https://hackclub.slack.com/canvas/CQFS7Q4A1|Secret Santa Rules>.
*If you need your matches phone number for shipping, please reach out to <@U066WR9MNHK>*`;
              }

              await sendSlackMessage(user.slackId, message);

              await base("Users").update([
                {
                  id: user.recordId,
                  fields: {
                    match: [match.recordId],
                  },
                },
              ]);
            } catch (e) {
              console.error("Error sending Slack message:", e);
            }
          }
        }
      }
    );
}

app.get("/slack/oauth/start", (_, res) => {
  const authUrl = `${SLACK_AUTH_URL}?client_id=${SLACK_CLIENT_ID}&scope=chat:write,users:read&redirect_uri=${encodeURIComponent(
    SLACK_REDIRECT_URI
  )}`;
  res.redirect(authUrl);
});

app.get("/slack/oauth/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Missing OAuth code");
  }

  const response = await fetch(SLACK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
      code: code,
      redirect_uri: SLACK_REDIRECT_URI,
    }),
  });

  const data = await response.json();

  if (data.ok) {
    slackToken = data.access_token;
    res.send("Slack integration successful!");
  } else {
    res.status(500).send("Slack OAuth error: " + data.error);
  }
});

app.get("/match", async (_, res) => {
  try {
    await matchUsersAndSendMessages();
    res.send("Matching complete, messages sent.");
  } catch (error) {
    res.status(500).send("Error matching users: " + error.message);
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
