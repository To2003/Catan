import { z } from 'zod';
import type { Action, EdgeId, HexId, ResourceBundle, VertexId } from '@tierra-austral/engine';

/**
 * The shape of every inbound message.
 *
 * The split is deliberate: **the server checks that a message makes sense, the
 * engine checks that a move is legal.** Over the wire TypeScript does not
 * exist, so this is where NaN, a 300 KB string or an invented vertex id stop.
 *
 * Every object is `strict()`: an unknown key is a rejected message, not an
 * ignored one. That is what keeps a `playerId` from ever riding along in a
 * payload — identity comes from the socket session and nothing else.
 */

/**
 * The board id types are template literals (`v${number}`), which a plain string
 * cannot satisfy. The regex is what makes the cast honest: nothing reaches the
 * engine without matching the shape first.
 */
/**
 * A tripwire for a compiler running without `strictNullChecks`.
 *
 * zod's inference depends on it: with it off, `addQuestionMarks` marks *every*
 * property optional and every schema in this file silently describes the wrong
 * shape. A deploy that compiled the server without our tsconfig failed here
 * with three screens of unrelated-looking errors; this one says what happened.
 */
type StrictNullChecksRequired = undefined extends string
  ? 'This project requires strictNullChecks: zod infers the wrong types without it'
  : true;
export const STRICT_NULL_CHECKS_REQUIRED: StrictNullChecksRequired = true;

const vertexId = z
  .string()
  .regex(/^v\d{1,3}$/, 'vertex id')
  .transform((value) => value as VertexId);
const edgeId = z
  .string()
  .regex(/^e\d{1,3}$/, 'edge id')
  .transform((value) => value as EdgeId);
const hexId = z
  .string()
  .regex(/^h\d{1,3}$/, 'hex id')
  .transform((value) => value as HexId);
const playerId = z.string().min(1).max(64);
const resource = z.enum(['wood', 'brick', 'sheep', 'wheat', 'ore']);
const color = z.enum(['celeste', 'bordo', 'verde', 'amarillo']);

/** Counts arriving from a client: non-negative integers, nothing exotic. */
const amount = z.number().int().min(0).max(100);
const bundle = z
  .object({
    wood: amount.optional(),
    brick: amount.optional(),
    sheep: amount.optional(),
    wheat: amount.optional(),
    ore: amount.optional(),
  })
  .strict()
  // Keys that arrived as `undefined` are dropped rather than passed along:
  // under exactOptionalPropertyTypes "absent" and "present but undefined" are
  // different things, and the engine only accepts the first.
  .transform(
    (value) =>
      Object.fromEntries(
        Object.entries(value).filter(([, amountValue]) => amountValue !== undefined),
      ) as Partial<ResourceBundle>,
  );

/**
 * Pinned to the engine's own `Action` union rather than left to inference.
 *
 * Two reasons, and the second one cost a failed deploy. First, a schema that
 * drifts from the union — a field renamed, a new action — now fails to compile
 * instead of quietly accepting the wrong shape. Second, zod's inference depends
 * on `strictNullChecks`: a toolchain that compiles this file without our
 * tsconfig infers every property as optional and the whole file stops
 * typechecking. Declaring the type makes the schema say what it means under any
 * compiler options.
 */
export const actionSchema: z.ZodType<Action> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('placeSettlement'), vertex: vertexId }).strict(),
  z.object({ type: z.literal('placeRoad'), edge: edgeId }).strict(),
  z.object({ type: z.literal('upgradeCity'), vertex: vertexId }).strict(),
  z.object({ type: z.literal('rollDice') }).strict(),
  z.object({ type: z.literal('discard'), cards: bundle }).strict(),
  z.object({ type: z.literal('moveRobber'), hex: hexId }).strict(),
  z.object({ type: z.literal('steal'), target: playerId }).strict(),
  z.object({ type: z.literal('buyDevCard') }).strict(),
  z.object({ type: z.literal('playKnight') }).strict(),
  z.object({ type: z.literal('playRoadBuilding') }).strict(),
  z
    .object({ type: z.literal('playYearOfPlenty'), resources: z.tuple([resource, resource]) })
    .strict(),
  z.object({ type: z.literal('playMonopoly'), resource }).strict(),
  z.object({ type: z.literal('maritimeTrade'), give: resource, want: resource }).strict(),
  z
    .object({
      type: z.literal('createOffer'),
      give: bundle,
      want: bundle,
      to: z.union([z.literal('all'), z.array(playerId).min(1).max(3)]),
    })
    .strict(),
  z
    .object({
      type: z.literal('respondOffer'),
      offerId: z.string().min(1).max(32),
      response: z.enum(['accept', 'reject']),
    })
    .strict(),
  z
    .object({
      type: z.literal('counterOffer'),
      offerId: z.string().min(1).max(32),
      give: bundle,
      want: bundle,
    })
    .strict(),
  z
    .object({
      type: z.literal('confirmTrade'),
      offerId: z.string().min(1).max(32),
      withPlayer: playerId,
    })
    .strict(),
  z.object({ type: z.literal('cancelOffer'), offerId: z.string().min(1).max(32) }).strict(),
  z.object({ type: z.literal('endTurn') }).strict(),
]);

export const MAX_NAME = 20;
export const MAX_CHAT = 300;

export const createRoomSchema = z.object({ name: z.string().min(1).max(MAX_NAME) }).strict();

export const joinRoomSchema = z
  .object({
    code: z.string().length(5),
    name: z.string().min(1).max(MAX_NAME),
    token: z.uuid().optional(),
  })
  .strict();

export const setColorSchema = z.object({ color }).strict();
export const readySchema = z.object({ ready: z.boolean() }).strict();
export const actionMessageSchema = z
  .object({ action: actionSchema, expectedVersion: z.number().int().min(0) })
  .strict();
export const chatSchema = z.object({ text: z.string().min(1).max(MAX_CHAT) }).strict();
export const voteSchema = z.object({ approve: z.boolean() }).strict();
