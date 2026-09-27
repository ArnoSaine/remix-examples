import { generateId } from './assignLocalizationIds.ts'

export type MessageDescriptor = {
  defaultMessage: string
  description?: string
  id?: string
}

const isServer = typeof window === 'undefined'

/**
 * Marks a message descriptor to be discovered and extracted as localization messages.
 */
export const defineMessage = isServer
  ? (message: MessageDescriptor) =>
      ({ id: message.id ? message.id : generateId(message) }) as MessageDescriptor
  : (message: MessageDescriptor) => ({ id: message.id }) as MessageDescriptor
