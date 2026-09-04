import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import { collectMessages, createBot, rcon, sleep } from "./helpers.mjs";

const PLAYER = "e2e_enchant";
const GUEST = "e2e_ench_guest";

// the namespaced /servertools:enchant would disambiguate this from vanilla's own /enchant, but
// the Moderation.NoColonInCommands feature cancels any command with a colon in its first word -
// ops included - so a player cannot reach it. The plain alias is what players type anyway, and
// the last test in this file pins down that it lands on this plugin rather than on vanilla.
const CMD = "/enchant";

const SWORD = "minecraft:diamond_sword";

// permission from config.yml Core.Enchant.Permission
const PERMISSION = "essentials.enchant";

let bot;
let guest;

// --- command output ---------------------------------------------------------

// an opped bot is also shown the server's admin broadcast of every rcon command this suite runs
// ("[Rcon: Replaced a slot on ...]"), which arrives asynchronously and can land inside a
// collection window. Those are not the command's own reply, so they are dropped.
const ADMIN_BROADCAST = /\[Rcon:|\[Server:/;

async function runCommand(sender, command, ms = 1500) {
  const collected = collectMessages(sender, ms);
  sender.chat(command);
  return (await collected).filter((line) => !ADMIN_BROADCAST.test(line)).join("\n");
}

// the server sends no packet at all when a completion has zero matches, so mineflayer waits out
// its timeout instead of resolving empty. that silence *is* the "no suggestions" result, so it is
// translated back into one - and the wait is shortened, since several tests expect it.
const NO_COMPLETIONS_MS = 2500;

async function completions(sender, line) {
  let matches;
  try {
    matches = await sender.tabComplete(line, true, true, NO_COMPLETIONS_MS);
  } catch (err) {
    if (/did not fire within timeout/i.test(err.message)) return [];
    throw err;
  }
  return matches.map((m) => (typeof m === "string" ? m : m.match));
}

// --- server-side inspection -------------------------------------------------

// clearing first means the inventory read below can only be describing the item under test
function giveHeldItem(player, item = SWORD) {
  rcon(`clear ${player}`);
  rcon(`item replace entity ${player} weapon.mainhand with ${item}`);
}

// mineflayer's item view does not reliably track component-only changes, so levels are read from
// the server's own NBT. SelectedItem is scoped to the main hand, so this cannot accidentally match
// an enchantment sitting in some other slot. Verified shape on 1.21.11:
//   {id: "minecraft:diamond_sword", count: 1, components: {"minecraft:enchantments": {"minecraft:sharpness": 5}}}
// Only the id/level pair is matched, so the pre-1.21.5 `levels` wrapper would parse too.
function enchantLevel(player, id) {
  const out = rcon(`data get entity ${player} SelectedItem`);
  const found = out.match(new RegExp(`${id}"?\\s*:\\s*(\\d+)`));
  return found ? Number(found[1]) : null;
}

describe("/enchant", () => {
  before(async () => {
    bot = await createBot(PLAYER);
    rcon(`op ${PLAYER}`);
    rcon(`tp ${PLAYER} 0 100 0`);
    await sleep(1000);
  });

  after(() => {
    try { rcon(`clear ${PLAYER}`); } catch {}
    try { rcon(`lp user ${GUEST} permission unset ${PERMISSION}`); } catch {}
    try { rcon(`clear ${GUEST}`); } catch {}
    try { bot?.quit(); } catch {}
    try { guest?.quit(); } catch {}
  });

  // --- applying ---

  it("applies an unqualified enchantment, defaulting to the minecraft namespace", async () => {
    giveHeldItem(PLAYER);
    const out = await runCommand(bot, `${CMD} sharpness 5`);

    assert.match(out, /applied/i, `expected a success message, got: ${out}`);
    assert.match(out, /sharpness/i, "success message should name the enchantment");
    assert.match(out, /diamond[_ ]sword/i, "success message should name the item");
    assert.equal(enchantLevel(PLAYER, "minecraft:sharpness"), 5);
  });

  it("accepts a fully qualified key", async () => {
    giveHeldItem(PLAYER);
    await runCommand(bot, `${CMD} minecraft:unbreaking 3`);
    assert.equal(enchantLevel(PLAYER, "minecraft:unbreaking"), 3);
  });

  it("defaults to level 1 when none is given", async () => {
    giveHeldItem(PLAYER);
    await runCommand(bot, `${CMD} mending`);
    assert.equal(enchantLevel(PLAYER, "minecraft:mending"), 1);
  });

  it("applies the level when trailing arguments follow it", async () => {
    // regression: `args.length == 2` silently dropped the level and applied 1 instead
    giveHeldItem(PLAYER);
    await runCommand(bot, `${CMD} sharpness 3 trailing junk`);
    assert.equal(enchantLevel(PLAYER, "minecraft:sharpness"), 3);
  });

  it("goes past the enchantment's own cap, since this enchants unsafely", async () => {
    // sharpness maxes at 5 in vanilla; the command deliberately allows more
    giveHeldItem(PLAYER);
    await runCommand(bot, `${CMD} sharpness 200`);
    assert.equal(enchantLevel(PLAYER, "minecraft:sharpness"), 200);
  });

  it("applies the highest level the enchantments component can hold", async () => {
    giveHeldItem(PLAYER);
    await runCommand(bot, `${CMD} sharpness 255`);
    assert.equal(enchantLevel(PLAYER, "minecraft:sharpness"), 255);
  });

  // --- rejecting ---

  it("shows usage with no arguments", async () => {
    giveHeldItem(PLAYER);
    const out = await runCommand(bot, CMD);
    assert.match(out, /usage/i, `expected usage text, got: ${out}`);
    assert.match(out, /<enchantment>/, "the usage placeholder should render literally, not as a tag");
  });

  it("refuses an empty hand", async () => {
    rcon(`clear ${PLAYER}`);
    const out = await runCommand(bot, `${CMD} sharpness`);
    assert.match(out, /hold an item/i, `expected the empty-hand message, got: ${out}`);
  });

  it("rejects an unknown enchantment", async () => {
    giveHeldItem(PLAYER);
    const out = await runCommand(bot, `${CMD} not_a_real_enchantment`);
    assert.match(out, /not a valid enchantment/i);
    assert.equal(enchantLevel(PLAYER, "minecraft:sharpness"), null, "nothing should have been applied");
  });

  it("rejects a malformed key without erroring out", async () => {
    // regression: Key.key threw InvalidKeyException on these, surfacing as "An internal error
    // occurred". Key.parseable now screens them first.
    giveHeldItem(PLAYER);
    for (const bad of ["foo:bar:baz", "sharp!ness", "minecraft:", "not a key"]) {
      const out = await runCommand(bot, `${CMD} ${bad}`);
      assert.match(out, /not a valid enchantment/i, `expected a clean rejection of '${bad}', got: ${out}`);
      assert.doesNotMatch(out, /internal error/i, `'${bad}' reached the server as an exception`);
    }
  });

  it("rejects a non-numeric level", async () => {
    giveHeldItem(PLAYER);
    const out = await runCommand(bot, `${CMD} sharpness abc`);
    assert.match(out, /not a valid integer/i);
    assert.equal(enchantLevel(PLAYER, "minecraft:sharpness"), null);
  });

  it("rejects levels the enchantments component cannot hold", async () => {
    for (const level of ["0", "-1", "256", "99999"]) {
      giveHeldItem(PLAYER);
      const out = await runCommand(bot, `${CMD} sharpness ${level}`);
      assert.match(out, /between/i, `expected level ${level} to be refused, got: ${out}`);
      assert.equal(enchantLevel(PLAYER, "minecraft:sharpness"), null, `level ${level} was applied anyway`);
    }
  });

  it("treats player input as text, not MiniMessage", async () => {
    // regression: the name was interpolated into the format string, so a player could smuggle
    // tags (<click:run_command:...>) into a message the server sent back to them. Placeholder
    // .unparsed keeps it literal, which means the tag survives into the plain-text rendering.
    giveHeldItem(PLAYER);
    const out = await runCommand(bot, `${CMD} <red>oops`);
    assert.match(out, /<red>oops/, `tags were parsed instead of shown literally: ${out}`);
  });

  // --- tab completion ---

  it("completes enchantment names unqualified", async () => {
    const matches = await completions(bot, `${CMD} sha`);
    assert.ok(matches.includes("sharpness"), `expected 'sharpness', got ${matches}`);
    assert.ok(
      !matches.includes("minecraft:sharpness"),
      "vanilla entries should complete bare until a ':' is typed"
    );
  });

  it("completes fully qualified keys once a ':' is typed", async () => {
    const matches = await completions(bot, `${CMD} minecraft:sh`);
    assert.ok(matches.includes("minecraft:sharpness"), `expected the qualified key, got ${matches}`);
  });

  it("offers the whole registry on an empty argument", async () => {
    const matches = await completions(bot, `${CMD} `);
    assert.ok(matches.includes("mending"), `expected 'mending' among ${matches.length} matches`);
    assert.ok(matches.length > 30, `expected the full enchantment registry, got ${matches.length}`);
  });

  it("does not complete player names", async () => {
    // regression: BaseCommand's default completer suggests online players, and /enchant
    // inherited it before this command overrode onTabComplete
    const matches = await completions(bot, `${CMD} `);
    assert.ok(!matches.includes(PLAYER), `player name leaked into completions: ${matches}`);
  });

  it("completes levels up to the enchantment's maximum", async () => {
    // narrower than what the command accepts on purpose - suggestions stay in the vanilla range
    // even though a higher level typed by hand is applied
    const matches = await completions(bot, `${CMD} sharpness `);
    assert.deepEqual(matches.sort(), ["1", "2", "3", "4", "5"], "sharpness caps at level 5");
  });

  it("offers no levels for an unknown enchantment", async () => {
    const matches = await completions(bot, `${CMD} not_a_real_enchantment `);
    assert.deepEqual(matches, []);
  });

  // --- permissions ---

  it("refuses a player without the permission", async () => {
    guest = await createBot(GUEST);
    rcon(`deop ${GUEST}`);
    rcon(`lp user ${GUEST} permission set ${PERMISSION} false`);
    await sleep(1000);
    giveHeldItem(GUEST);

    const out = await runCommand(guest, `${CMD} sharpness 5`);
    assert.match(out, /do not have access/i, `expected a refusal, got: ${out}`);
    assert.equal(enchantLevel(GUEST, "minecraft:sharpness"), null, "the item was enchanted anyway");
  });

  it("offers no completions to a player without the permission", async () => {
    const matches = await completions(guest, `${CMD} sha`);
    assert.deepEqual(matches, [], `completions leaked to an unprivileged player: ${matches}`);
  });

  // --- command registration ---

  it("owns the unprefixed /enchant alias", async () => {
    // every test above assumes this. if it fails, vanilla's /enchant won the alias and the rest
    // of this file is quietly testing the wrong command - vanilla's takes <targets> first, so it
    // would reject a bare enchantment name rather than reading it as one.
    giveHeldItem(PLAYER);
    const out = await runCommand(bot, "/enchant");
    assert.match(out, /usage: \/enchant <enchantment>/i, `vanilla may have taken the alias: ${out}`);
  });
});
