import { generateId } from './assignLocalizationIds.ts'

export type MessageDescriptor = {
  readonly id: string
  readonly defaultMessage: string | undefined
}

export type MessageDefinition = {
  readonly defaultMessage: string
  readonly description?: string
  readonly id?: string
}

/**
 * Marks a message definition to be discovered and extracted as localization messages.
 */
export function defineMessage(message: MessageDefinition): MessageDescriptor {
  return {
    id: message.id ?? generateId(message),
    defaultMessage: message.defaultMessage,
  }
}
