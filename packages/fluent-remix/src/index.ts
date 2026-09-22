export type MessageDescriptor = {
  id: string
  defaultMessage: string
}

/**
 * Marks a message descriptor for discovery by future tooling to extract localization messages.
 */
export function defineMessage(message: MessageDescriptor): MessageDescriptor {
  return message
}
