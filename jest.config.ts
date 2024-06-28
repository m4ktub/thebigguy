import type { Config } from 'jest';

const config: Config = {
    verbose: true,
    testMatch: [ "**/src/**/*.test.(ts|js)" ],
    moduleFileExtensions: [ "ts", "js" ],
    testEnvironment: "node",
    transform: {
        "^.+\\.(ts|tsx)$": "ts-jest",
    },
    slowTestThreshold: 10
};

export default config;
