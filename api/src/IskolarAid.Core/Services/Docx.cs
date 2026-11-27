// =====================================================================
// Docx.cs - builds editable Word (.docx) files for every export.
//
// A .docx file is a zip with a few XML files inside. We write only the
// parts Word needs (no extra library):
//   [Content_Types].xml  -> says which file is what
//   _rels/.rels          -> points to the main document
//   word/document.xml    -> the actual content (title, text, table)
//
// Used by: Reports page, Activity log, scholar Payment history,
// receipts and blank templates (see the "docx" endpoints in Controllers.cs).
// =====================================================================
using System.IO.Compression;
using System.Security;
using System.Text;

namespace IskolarAid.Core.Services;

public static class Docx
{
    // What goes into one Word file. Everything except Title is optional.
    public sealed class Content
    {
        public string Title { get; init; } = "";
        public IReadOnlyList<string> Lines { get; init; } = []; // text under the title (one paragraph each)
        public IReadOnlyList<string> Columns { get; init; } = []; // table header; empty = no table
        public IReadOnlyList<IReadOnlyList<string?>> Rows { get; init; } = [];
        public int BlankRows { get; init; } // extra empty rows to fill in by hand
        public IReadOnlyList<string> Signatures { get; init; } = []; // "Prepared by", "Approved by"...
    }

    public static byte[] Write(Content c)
    {
        // Wide tables (many columns) are easier to edit on a landscape page.
        var landscape = c.Columns.Count > 5;
        var body = new StringBuilder();
        body.Append(Para("Legacy College of Compostela - IskolarAid", size: 18, color: "666666"));
        body.Append(Para(c.Title, bold: true, size: 32, color: "00444F"));
        body.Append(
            Para($"Generated {DateTime.Now:MMMM dd, yyyy h:mm tt}", size: 18, color: "666666")
        );
        foreach (var line in c.Lines)
            body.Append(Para(line));
        if (c.Columns.Count > 0)
            body.Append(Table(c.Columns, c.Rows, c.BlankRows));
        if (c.Signatures.Count > 0)
        {
            body.Append(Para(""));
            body.Append(Para(""));
            body.Append(
                Para(
                    string.Join(
                        "            ",
                        c.Signatures.Select(_ => "______________________________")
                    )
                )
            );
            body.Append(
                Para(string.Join("            ", c.Signatures.Select(s => s.PadRight(30))))
            );
        }
        // Page size A4 (in twentieths of a point), 1 cm-ish margins.
        var (w, h) = landscape ? (16838, 11906) : (11906, 16838);
        body.Append(
            $"<w:sectPr><w:pgSz w:w=\"{w}\" w:h=\"{h}\"{(landscape ? " w:orient=\"landscape\"" : "")}/>"
                + "<w:pgMar w:top=\"720\" w:right=\"720\" w:bottom=\"720\" w:left=\"720\" w:header=\"0\" w:footer=\"0\" w:gutter=\"0\"/></w:sectPr>"
        );

        var document =
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
            + "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>"
            + body
            + "</w:body></w:document>";

        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            Add(
                zip,
                "[Content_Types].xml",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                    + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                    + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
                    + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
                    + "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>"
                    + "</Types>"
            );
            Add(
                zip,
                "_rels/.rels",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                    + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                    + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>"
                    + "</Relationships>"
            );
            Add(zip, "word/document.xml", document);
        }
        return ms.ToArray();
    }

    // Shortcut for a plain table export (reports, logs, payment history).
    public static byte[] Table(
        string title,
        IReadOnlyList<string> columns,
        IEnumerable<IReadOnlyList<string?>> rows,
        params string[] lines
    ) =>
        Write(
            new Content
            {
                Title = title,
                Columns = columns,
                Rows = rows.ToList(),
                Lines = lines,
            }
        );

    private static void Add(ZipArchive zip, string name, string xml)
    {
        using var w = new StreamWriter(
            zip.CreateEntry(name, CompressionLevel.Optimal).Open(),
            new UTF8Encoding(false)
        );
        w.Write(xml);
    }

    // Escape text for XML so names like "A & B" or "<b>" stay plain text.
    private static string X(string? s) => SecurityElement.Escape(s ?? "") ?? "";

    // One paragraph. size is in half-points (24 = 12 pt).
    private static string Para(string text, bool bold = false, int size = 22, string? color = null)
    {
        var rPr =
            $"<w:rPr><w:rFonts w:ascii=\"Arial\" w:hAnsi=\"Arial\"/>{(bold ? "<w:b/>" : "")}{(color is null ? "" : $"<w:color w:val=\"{color}\"/>")}<w:sz w:val=\"{size}\"/></w:rPr>";
        return $"<w:p><w:pPr><w:spacing w:after=\"80\"/></w:pPr><w:r>{rPr}<w:t xml:space=\"preserve\">{X(text)}</w:t></w:r></w:p>";
    }

    private static string Cell(string? text, bool header)
    {
        var shade = header ? "<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"00444F\"/>" : "";
        var rPr =
            $"<w:rPr><w:rFonts w:ascii=\"Arial\" w:hAnsi=\"Arial\"/>{(header ? "<w:b/><w:color w:val=\"FFFFFF\"/>" : "")}<w:sz w:val=\"18\"/></w:rPr>";
        return $"<w:tc><w:tcPr>{shade}</w:tcPr><w:p><w:r>{rPr}<w:t xml:space=\"preserve\">{X(text)}</w:t></w:r></w:p></w:tc>";
    }

    private static string Table(
        IReadOnlyList<string> columns,
        IReadOnlyList<IReadOnlyList<string?>> rows,
        int blankRows
    )
    {
        var sb = new StringBuilder(
            "<w:tbl><w:tblPr><w:tblW w:w=\"5000\" w:type=\"pct\"/><w:tblBorders>"
        );
        foreach (var side in new[] { "top", "left", "bottom", "right", "insideH", "insideV" })
            sb.Append($"<w:{side} w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"BFBFBF\"/>");
        sb.Append("</w:tblBorders></w:tblPr><w:tblGrid>");
        foreach (var _ in columns)
            sb.Append("<w:gridCol/>");
        sb.Append("</w:tblGrid>");
        // The header row repeats on every page.
        sb.Append("<w:tr><w:trPr><w:tblHeader/></w:trPr>");
        foreach (var c in columns)
            sb.Append(Cell(c, true));
        sb.Append("</w:tr>");
        foreach (var row in rows)
        {
            sb.Append("<w:tr>");
            for (var i = 0; i < columns.Count; i++)
                sb.Append(Cell(i < row.Count ? row[i] : "", false));
            sb.Append("</w:tr>");
        }
        for (var b = 0; b < blankRows; b++)
        {
            sb.Append("<w:tr><w:trPr><w:trHeight w:val=\"400\"/></w:trPr>");
            foreach (var _ in columns)
                sb.Append(Cell("", false));
            sb.Append("</w:tr>");
        }
        return sb.Append("</w:tbl>").ToString();
    }
}
