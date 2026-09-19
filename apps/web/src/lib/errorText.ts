import type { ErrorCode } from '@tierra-austral/engine';

/** Engine rejection codes as something a person can read. */
export const ERROR_TEXT: Record<ErrorCode, string> = {
  NOT_YOUR_TURN: 'No es tu turno',
  WRONG_PHASE: 'No se puede en esta fase',
  INSUFFICIENT_RESOURCES: 'No te alcanzan los recursos',
  DISTANCE_RULE: 'Regla de distancia',
  NOT_CONNECTED: 'No conecta con nada tuyo',
  STALE_STATE: 'El estado quedó viejo',
  NOT_ENOUGH_PIECES: 'No te quedan piezas',
  OCCUPIED: 'Ya hay algo ahí',
  NO_SETTLEMENT: 'No hay asentamiento',
  NOT_OWNER: 'No es tuyo',
  ALREADY_CITY: 'Ya es una ciudad',
  INVALID_TARGET: 'Objetivo inválido',
  GAME_OVER: 'La partida terminó',
  INVALID_AMOUNT: 'Cantidad inválida',
  INVALID_DISCARD: 'Tenés que descartar la cantidad exacta',
  DECK_EMPTY: 'No quedan cartas',
  CARD_NOT_IN_HAND: 'No tenés esa carta',
  CARD_BOUGHT_THIS_TURN: 'La compraste este turno',
  ALREADY_PLAYED_DEV_CARD: 'Ya jugaste una carta este turno',
  NO_LEGAL_PLACEMENT: 'No hay dónde construir',
  NOT_IMPLEMENTED: 'Todavía no está implementado',
};
