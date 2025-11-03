// Lightweight adapter named firebase-api.js so existing frontend API.saveSalesLog calls work.
// This implementation posts to the local Flask backend at /api/visits.

window.API = {
    saveSalesLog: async function(formData) {
        // The backend expects a JSON payload. To keep compatibility with existing export logic
        // we'll wrap visits as an array under `visits` and include staff info if available.
        const payload = {
            staff: formData.salesPerson || '',
            visits: [
                {
                    school: formData.schoolName || '',
                    region: formData.region || '',
                    district: formData.district || '',
                    location: formData.location || '',
                    visitStart: formData.visitTime || formData.visitStart || '',
                    visitEnd: formData.visitEnd || '',
                    // Normalize duration to numeric minutes whenever possible.
                    // Accept values like 50, '50', '50분', '약 50분' and extract digits.
                    duration: (function(d){
                        if (d === undefined || d === null || d === '') return '';
                        if (typeof d === 'number' && isFinite(d)) return Math.floor(d);
                        try{
                            const s = String(d);
                            const m = s.match(/(\d+)/);
                            if (m) return Number(m[1]);
                            const n = Number(s);
                            return isFinite(n) ? Math.floor(n) : '';
                        }catch(e){ return ''; }
                    })(formData.duration || formData.durationMinutes || ''),
                    subjects: [
                        {
                            subject: formData.subject || '',
                            teacher: formData.teacherName || '',
                            publisher: formData.currentPublisher || '',
                            contact: formData.contactAcquired || '',
                            followUp: formData.nextAction || '',
                            conversation: formData.teacherFeedback || '',
                            meetings: formData.activities || []
                        }
                    ],
                    notes: formData.additionalNotes || ''
                }
            ]
        };

        const res = await fetch('/api/visits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const txt = await res.text();
            throw new Error('서버 저장 실패: ' + res.status + ' ' + txt);
        }
        return await res.json();
    }
};