const path = require('path');

module.exports = {
  target: 'node', // VS Code extensions run in a Node.js environment
  mode: 'development', // production for packaging
  entry: './src/extension.ts', // The entry point of your extension
  output: {
    path: path.resolve(__dirname, 'out'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode' // The vscode-module is created on-the-fly.
    // You can add other modules here that you don't want to be packaged.
    // For example, if @grpc/grpc-js should be an external dependency
    // rather than bundled, add it here. Be cautious with this for publishing.
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  }
};