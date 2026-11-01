// Shared by the server and the page. 12 seats play; everyone else joins the audience, votes, and earns CROWD_REWARD for finding the truth or the bot.
export const MAX_PLAYERS=12,MAX_AUDIENCE=300,CROWD_REWARD=1000;
// A lobby pet is drawn from the first PET_SEED hex digits of a person's id, so the host screen is sent 4 characters per audience pet and still matches each phone.
export const PET_SEED=4;
