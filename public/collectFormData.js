// Global function to collect form data for saving/draft
window.collectFormData = function() {
  const out = { 
    ts: Date.now(), 
    visitDate:'', 
    staff:'', 
    region:'', 
    school:'', 
    visitStartHour:'', 
    visitStartMinute:'', 
    visitDuration:'', 
    visitEndTime:'', 
    summary:'', 
    subjects: [] 
  };
  
  try{
    out.visitDate = (document.getElementById('visitDate')?.value||'').trim();  
    out.staff = ((document.getElementById('staffInfo')?.textContent||'').replace(/^담당자:\s*/,'')||'').trim();
    out.region = (window.selectedRegion || document.getElementById('selectedRegionInput')?.value || '').trim();
    out.school = (window.selectedSchool || document.getElementById('selectedSchoolInput')?.value || '').trim();
    out.visitStartHour = (document.getElementById('visitStartHour')?.value||'').trim();
    out.visitStartMinute = (document.getElementById('visitStartMinute')?.value||'').trim();
    out.visitDuration = (document.getElementById('visitDurationInput')?.value||'').trim();
    out.visitEndTime = (document.getElementById('visitEndTime')?.value||'').trim();
    out.summary = (document.getElementById('generatedSummary')?.value||'').trim();
    
    const blocks = Array.from(document.querySelectorAll('.subject-block')) || [];
    console.log('[collectFormData] Found', blocks.length, 'subject blocks');
    
    blocks.forEach((block, idx) => {
      try{
        const subj = (block.querySelector('.subject-name')?.value || '').trim();
        const teacher = (block.querySelector('.teacher-name')?.value || '').trim();
        const publisher = (block.querySelector('.publisher-name')?.value || '').trim();
        const contactSuffix = (block.querySelector('.contact-suffix')?.value || '').trim();
        const contactEmail = (block.querySelector('.contact-email')?.value || '').trim();
        const contactFormatted = (block.querySelector('.contact-formatted')?.textContent || '').trim();
        const conversation = (block.querySelector('.conversation-detail')?.value || '').trim();
        const customerRequest = (block.querySelector('.customer-request')?.value || '').trim();
        const delivery = (block.querySelector('.delivery-items')?.value || '').trim();
        const followUp = (block.querySelector('.followUpSelect')?.value || '').trim();
        const friendliness = (block.querySelector('input[name="friendliness"]')?.value || '').trim();
        const meetings = Array.from(block.querySelectorAll('.meeting-btn')).filter(b=>b.classList.contains('is-active')).map(b=> (b.textContent||'').trim());
        
        console.log('[collectFormData] Block', idx, '- subject:', subj, 'teacher:', teacher);
        
        out.subjects.push({ 
          subject: subj,
          teacher,
          publisher,
          contactSuffix,
          contactEmail,
          contactFormatted,
          conversation,
          customerRequest,
          delivery,
          followUp,
          friendliness,
          meetings
        });
      }catch(e){ 
        console.warn('[collectFormData] Failed to collect subject block', idx, e); 
      }
    });
    
    console.log('[collectFormData] Collected', out.subjects.length, 'subjects');
  }catch(e){ 
    console.warn('[collectFormData] Failed:', e); 
  }
  
  return out;
};

console.log('[collectFormData.js] Loaded');
