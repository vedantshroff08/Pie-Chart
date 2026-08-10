import json from "@rollup/plugin-json";

export default commandLineArgs => {
    const defaultConfig = commandLineArgs.configDefaultConfig;

    return defaultConfig.map(config => ({
        ...config,
        plugins: [
            json({
                preferConst: true,
                compact: true,
                namedExports: false
            }),
            ...(config.plugins || [])
                .filter(p => p !== null)
                .filter(p => p.name !== "json")
        ]
    }));
};