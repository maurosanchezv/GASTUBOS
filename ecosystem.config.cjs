module.exports = {
  apps: [
    {
      name: 'gastubos-api',
      script: 'src/index.js',
      cwd: './backend',
      watch: ['src'],
      ignore_watch: ['node_modules'],
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'gastubos-front',
      script: 'node_modules/.bin/vite',
      args: '--host',
      cwd: './frontend',
      interpreter: 'none',
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
