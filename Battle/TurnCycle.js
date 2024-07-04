// turn cycle object that receives instructions as new events
// battle event handler will handle each different event in sequences

class TurnCycle {
  constructor({ battle, onNewEvent, onWinner }) {
    this.battle = battle;
    this.onNewEvent = onNewEvent;
    this.onWinner = onWinner;
    this.currentTeam = "player"; //or "enemy"
  }

  async turn() {
    //Get the caster
    const casterId = this.battle.activeCombatants[this.currentTeam];
    const caster = this.battle.combatants[casterId];
    const enemyId =
      this.battle.activeCombatants[
        caster.team === "player" ? "enemy" : "player"
      ];
    const enemy = this.battle.combatants[enemyId];

    const submission = await this.onNewEvent({
      type: "submissionMenu",
      caster,
      enemy,
    });

    // stop here if we are replacing this pizza
    if (submission.replacement) {
      await this.onNewEvent({
        type: "replace",
        replacement: submission.replacement,
      });
      await this.onNewEvent({
        type: "textMessage",
        text: `Go get 'em", ${submission.replacement.name}!`,
      });
      this.nextTurn();
      return;
    }


    
    if (submission.instanceId) {
    
      // add to list to persist to player state post battle
      this.battle.usedInstanceIds[submission.instanceId] = true

    // removing item from battle state
      this.battle.items = this.battle.items.filter(
        (i) => i.instanceId !== submission.instanceId
      );
    }

    const resultingEvents = caster.getReplacedEvents(submission.action.success);

    for (let i = 0; i < resultingEvents.length; i++) {
      const event = {
        ...resultingEvents[i],
        submission,
        action: submission.action,
        caster,
        target: submission.target,
      };
      await this.onNewEvent(event);
    }

    // Check if target died?
    const targetDead = submission.target.hp <= 0;
    if (targetDead) {
      await this.onNewEvent({
        type: "textMessage",
        text: `${submission.target.name} died X_X !`,
      });

      if (submission.target.team === "enemy") {
        const playerActivePizzaId = this.battle.activeCombatants.player;
        const xp = submission.target.givesXp;

        await this.onNewEvent({
          type: "textMessage",
          text: `${this.currentTeam} Gained ${xp} XP!`
        })
        await this.onNewEvent({
          type: "giveXp",
          xp,
          combatant: this.battle.combatants[playerActivePizzaId],
        });
      }
    }

    // Check if a team won?
    const winner = this.getWinningTeam();
    if (winner) {
      await this.onNewEvent({
        type: "textMessage",
        text: `Winner!`,
      });
      this.onWinner( winner )
      // ToDo: end battle and return to overworld
      // end battle when someone wins
      return;
    }

    // If we have dead target, but no winner, bring in replacement
    if (targetDead) {
      const replacement = await this.onNewEvent({
        type: "replacementMenu",
        team: submission.target.team,
      });
      await this.onNewEvent({
        type: "replace",
        replacement: replacement,
      });
      await this.onNewEvent({
        type: "textMessage",
        text: `${replacement.name} appears!`,
      });
    }

    //Check for post events
    //(Do things AFTER your original turn submission)
    const postEvents = caster.getPostEvents();
    for (let i = 0; i < postEvents.length; i++) {
      const event = {
        ...postEvents[i],
        submission,
        action: submission.action,
        caster,
        target: submission.target,
      };
      await this.onNewEvent(event);
    }

    //Check for status expire
    const expiredEvent = caster.decrementStatus();
    if (expiredEvent) {
      await this.onNewEvent(expiredEvent);
    }

    this.currentTeam = this.currentTeam === "player" ? "enemy" : "player";
    this.turn();
  }

  getWinningTeam() {
    let aliveTeams = {};
    Object.values(this.battle.combatants).forEach((c) => {
      if (c.hp > 0) {
        aliveTeams[c.team] = true;
      }
    });

    if (!aliveTeams["player"]) {
      return "enemy";
    }
    if (!aliveTeams["enemy"]) {
      return "player";
    }
    return null;
  }

  // next turn method for when mid turn events happen (swapping/replacement)
  nextTurn() {
    this.currentTeam = this.currentTeam === "player" ? "enemy" : "player";
    this.turn();
  }

  async init() {
    await this.onNewEvent({
      type: "textMessage",
      text: `${this.battle.enemy.name} wants to throw down!`
    })

    //Start the first turn!
    this.turn();
  }
}