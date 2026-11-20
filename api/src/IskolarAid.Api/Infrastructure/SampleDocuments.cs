using System.Text;
using Microsoft.EntityFrameworkCore;
using IskolarAid.Core.Rules;
using IskolarAid.Data;
using IskolarAid.Data.Entities;

namespace IskolarAid.Api.Infrastructure;

/// <summary>
/// Development-only: five made-up PDFs (one per requirement type) that get attached to every compliance record
/// that claims to have a document (Submitted / Approved / Rejected) but has none. Every scholar gets the same five files.
/// Idempotent, and also swaps out the tiny placeholder files an earlier version of the history seeder created.
/// </summary>
public static class SampleDocuments
{
    private sealed record Doc(string RequirementType, string FileName, string Title, string[] Lines);

    private static readonly Doc[] Docs =
    [
        new("PSA Birth Certificate", "PSA-Birth-Certificate-SAMPLE.pdf", "CERTIFICATE OF LIVE BIRTH",
        [
            "Republic of the Philippines", "Philippine Statistics Authority", "",
            "Registry No.: 0000-0000-000000", "Name of Child: JUAN DELA CRUZ (sample)", "Sex: Male          Date of Birth: January 01, 2004",
            "Place of Birth: Compostela, Davao de Oro", "", "Mother: MARIA DELA CRUZ (sample)", "Father: PEDRO DELA CRUZ (sample)", "",
            "Issued for scholarship application purposes."
        ]),
        new("Enrollment Form", "Certificate-of-Enrollment-SAMPLE.pdf", "CERTIFICATE OF ENROLLMENT",
        [
            "Legacy College of Compostela", "Office of the Registrar", "",
            "This is to certify that the student named below is officially enrolled", "for the current semester.", "",
            "Student: JUAN DELA CRUZ (sample)", "Program: Bachelor of Science in Information Technology", "Year Level: 2nd Year      Status: Regular",
            "Academic Year: 2026-2027", "", "Issued upon request for scholarship purposes.", "", "______________________", "University Registrar"
        ]),
        new("COR", "Certificate-of-Registration-SAMPLE.pdf", "CERTIFICATE OF REGISTRATION",
        [
            "Legacy College of Compostela", "", "Student: JUAN DELA CRUZ (sample)      Student No.: 2026-000000",
            "Program: BS Information Technology      Year: 2nd", "",
            "Code       Subject                              Units",
            "IT 201     Data Structures and Algorithms         3",
            "IT 202     Database Management Systems            3",
            "IT 203     Web Development                        3",
            "GE 104     Ethics                                 3",
            "PE 102     Physical Education 2                   2", "",
            "Total units: 14", "Assessed fees: PHP 0.00 (scholar)"
        ]),
        new("Grades", "Report-of-Grades-SAMPLE.pdf", "REPORT OF GRADES",
        [
            "Legacy College of Compostela", "Office of the Registrar", "", "Student: JUAN DELA CRUZ (sample)", "Semester: 1st Semester, AY 2025-2026", "",
            "Subject                                   Grade",
            "Data Structures and Algorithms              1.50",
            "Database Management Systems                 1.75",
            "Web Development                             1.25",
            "Ethics                                      1.50",
            "Physical Education 2                        1.00", "", "General Weighted Average: 1.40", "Remarks: Passed"
        ]),
        new("Scholarship Contract", "Scholarship-Contract-SAMPLE.pdf", "SCHOLARSHIP CONTRACT",
        [
            "IskolarAid Scholarship Program", "", "This agreement is made between the Scholarship Office of Legacy College",
            "of Compostela and the scholar named below (sample).", "", "Scholar: JUAN DELA CRUZ (sample)", "",
            "1. The scholar shall maintain the minimum grade and enrollment requirements.",
            "2. The scholar shall submit all compliance documents before their due dates.",
            "3. Stipends are released only while the scholar is in good standing.",
            "4. Personal data is processed under the Data Privacy Act of 2012.", "",
            "______________________        ______________________", "Scholar                              Scholarship Officer"
        ]),
    ];

    public static async Task AttachAsync(IskolarDbContext db, ILogger log)
    {
        var admin = await db.Users.OrderBy(u => u.Id).Where(u => u.Role == Roles.Admin).Select(u => (int?)u.Id).FirstOrDefaultAsync();
        var files = Docs.ToDictionary(d => d.RequirementType, d => (d, Bytes: BuildPdf(d.Title, d.Lines)));
        var oldSeeded = new[] { "psa-", "coe-", "cor-", "grades-", "contract-" };

        var records = await db.ComplianceRecords
            .Where(c => c.Status == "Submitted" || c.Status == "Approved" || c.Status == "Rejected")
            .ToListAsync();
        var ids = records.Select(r => r.Id).ToList();
        var existing = (await db.FileAttachments.Where(f => ids.Contains(f.ComplianceId)).ToListAsync())
            .GroupBy(f => f.ComplianceId).ToDictionary(g => g.Key, g => g.ToList());

        int added = 0, replaced = 0;
        foreach (var r in records)
        {
            if (!files.TryGetValue(r.RequirementType, out var f)) continue;
            var current = existing.GetValueOrDefault(r.Id) ?? [];
            // keep anything a real person uploaded; only fill gaps and replace the old tiny placeholders
            if (current.Any(a => !oldSeeded.Any(p => a.FileName.StartsWith(p, StringComparison.OrdinalIgnoreCase)) && a.FileName != f.d.FileName)) continue;
            if (current.Any(a => a.FileName == f.d.FileName)) continue;
            if (current.Count > 0) { db.FileAttachments.RemoveRange(current); replaced++; } else added++;
            db.FileAttachments.Add(new FileAttachment
            {
                ScholarId = r.ScholarId, ComplianceId = r.Id, FileName = f.d.FileName, OriginalName = f.d.FileName, FileType = ".pdf", FileSize = f.Bytes.Length,
                FileData = f.Bytes, UploadedBy = admin, UploadedAt = r.DateSubmitted ?? r.CreatedAt,
            });
            r.FilePath = f.d.FileName;
            r.DateSubmitted ??= r.CreatedAt.Date;
        }
        await db.SaveChangesAsync();
        log.LogInformation("Sample documents: attached {Added} new, replaced {Replaced} placeholder files.", added, replaced);
    }

    /// <summary>Minimal single-page PDF (Helvetica, ASCII only) with a heading and body lines.</summary>
    private static byte[] BuildPdf(string title, string[] lines)
    {
        static string Esc(string s) => s.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");
        var sb = new StringBuilder();
        sb.Append("BT /F2 11 Tf 1 0 0 rg 60 790 Td (SAMPLE DOCUMENT - FOR DEMONSTRATION ONLY) Tj ET\n");
        sb.Append($"BT /F2 20 Tf 0 0 0 rg 60 740 Td ({Esc(title)}) Tj ET\n");
        sb.Append("0.4 g 60 728 475 1 re f 0 g\n");
        var y = 700;
        foreach (var line in lines)
        {
            if (line.Length > 0) sb.Append($"BT /F1 12 Tf 60 {y} Td ({Esc(line)}) Tj ET\n");
            y -= 22;
        }
        sb.Append("BT /F1 9 Tf 0.4 g 60 40 Td (Made-up data generated by the IskolarAid development seeder.) Tj ET\n");
        var content = sb.ToString();

        var objs = new List<string>
        {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 6 0 R /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> >>",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
            $"<< /Length {content.Length} >>\nstream\n{content}endstream",
        };
        var pdf = new StringBuilder("%PDF-1.4\n");
        var offsets = new List<int>();
        for (var i = 0; i < objs.Count; i++) { offsets.Add(pdf.Length); pdf.Append($"{i + 1} 0 obj\n{objs[i]}\nendobj\n"); }
        var xref = pdf.Length;
        pdf.Append($"xref\n0 {objs.Count + 1}\n0000000000 65535 f \n");
        foreach (var o in offsets) pdf.Append($"{o:D10} 00000 n \n");
        pdf.Append($"trailer\n<< /Size {objs.Count + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n");
        return Encoding.ASCII.GetBytes(pdf.ToString());
    }
}
