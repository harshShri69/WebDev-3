
const crypto = require("crypto");

const numberOfRolls = 5;

console.log("Starting dice rolls...");

for (let i = 1; i <= numberOfRolls; i++) {

  
    const dice = crypto.randomInt(1, 7);

    console.log("Dice Roll", i, ":", dice);

}

console.log("All dice rolls completed");