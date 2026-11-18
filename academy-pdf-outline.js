// Conservative, editable PDF outline extraction. Never infer an answer key.
const clean=s=>String(s||'').replace(/\r/g,'').trim();
export function outlineFromText(source){
 const lines=clean(source).split(/\n+/).map(s=>s.trim()).filter(Boolean);
 const lessons=[],questions=[];let current=null,question=null;
 for(const line of lines){
  const heading=line.match(/^(?:lesson|chapter|unit|module)\s+(?:\d+[.:\-]?\s*)?(.+)$/i);
  const q=line.match(/^(?:question\s*\d+\s*[:.)-]?|\d+[.)])\s*(.+)$/i);
  if(heading){current={title:heading[1].slice(0,200),content:''};lessons.push(current);question=null;continue}
  if(q){question={question_text:q[1].slice(0,10000),question_type:'essay',points:1,options:[]};questions.push(question);continue}
  const opt=line.match(/^([A-D])[.)]\s+(.+)$/);
  if(opt&&question){question.options.push({text:opt[2].slice(0,10000),is_correct:false});continue}
  if(question){question.question_text=(question.question_text+' '+line).slice(0,10000)}
  else if(current){current.content=(current.content+'\n'+line).trim().slice(0,50000)}
  else {current={title:'Introduction',content:line.slice(0,50000)};lessons.push(current)}
 }
 return {lessons:lessons.slice(0,100),questions:questions.slice(0,200),warnings:['Review all headings, questions and options. Correct answers are not inferred; every imported question is an essay draft unless edited manually.']};
}
