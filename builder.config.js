module.exports = {
  appId: 'com.baibhavbista.workcycles',
  productName: 'WorkCycles',
  files: [
    'dist/**/*',
    'electron/**/*'
  ],
  extraResources: [
    { from: 'electron/assets', to: 'assets' }
  ],
  mac: {
    target: 'dmg',
    category: 'public.app-category.productivity'
  },
  win: {
    target: 'zip'
  }
}; 