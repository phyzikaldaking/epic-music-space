import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.(ts|tsx)$": [
      "babel-jest",
      {
        presets: ["next/babel"],
      },
    ],
  },
  testMatch: ["**/__tests__/**/*.(test|spec).(ts|tsx|js)"],
};

export default config;
