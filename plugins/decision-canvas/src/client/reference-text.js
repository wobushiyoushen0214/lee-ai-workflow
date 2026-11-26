export function referenceText(workspacePath, records) {
  const root=workspacePath.replace(/[\\/]+$/,'');
  return ['请参考以下决策记录：',...records.map(record=>{
    const title=record.title.replace(/[\r\n]+/g,' ');
    const path=`${root}/${record.path}`;
    return `- ${title}\n  ${path}`;
  })].join('\n');
}
