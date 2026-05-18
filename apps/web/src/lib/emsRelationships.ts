export const EMS_RELATIONSHIP_LABELS = {
  investor: {
    singular: "Investor",
    plural: "Investors",
    action: "Invest in Artist",
    active: "Investing",
    description:
      "People investing attention, belief, shares, streams, purchases, and time into an artist's journey.",
  },
  ally: {
    singular: "Ally",
    plural: "Allies",
    action: "Add Ally",
    pending: "Ally Request Sent",
    active: "Allies",
    description: "Mutual connections you build with, support, message, and move with inside Epic Music Space.",
  },
  stakeholder: {
    singular: "Stakeholder",
    plural: "Stakeholders",
    action: "Become a Stakeholder",
    active: "Stakeholder Access",
    description: "VIP supporters with exclusive access to drops, rooms, updates, perks, and the creative journey.",
    disclaimer:
      "On Epic Music Space, a Stakeholder is a VIP supporter with exclusive access. It does not mean equity ownership or a financial security.",
  },
  client: {
    singular: "Client",
    plural: "Clients",
    action: "Book as Client",
    active: "Client",
    description: "People who buy, book, license, or hire creative services from an artist or provider.",
  },
  collaborator: {
    singular: "Collaborator",
    plural: "Collaborators",
    action: "Collaborate",
    active: "Collaborating",
    description: "People actively working on music, releases, sessions, or creative projects together.",
  },
} as const;

export type EmsRelationshipKey = keyof typeof EMS_RELATIONSHIP_LABELS;

export const EMS_RELATIONSHIP_COPY = {
  investorCircle: "Investor Circle",
  investorCircleDescription:
    "People investing attention, belief, shares, streams, purchases, and time into your career.",
  stakeholderAccess: "Stakeholder Access",
  stakeholderAccessDescription:
    "Exclusive drops, private listening rooms, unreleased music, behind-the-scenes studio content, early offers, and VIP perks.",
  clientDesk: "Client Desk",
  clientDeskDescription: "Orders, licenses, bookings, files, and delivery for people who hire or buy from you.",
};
