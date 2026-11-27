// =====================================================================
// XlsxReader.cs - reads the first sheet of an Excel (.xlsx) file.
//
// An .xlsx is a zip of XML files. We only need the cell text, so we read:
//   xl/workbook.xml + xl/_rels/workbook.xml.rels -> which file is the first sheet
//   xl/sharedStrings.xml                         -> the text cells point to
//   xl/worksheets/sheetN.xml                     -> the cells themselves
// No extra package needed. Used by ScholarImportService.
// =====================================================================
using System.IO.Compression;
using System.Xml.Linq;

namespace IskolarAid.Core.Services;

public static class XlsxReader
{
    // Returns one dictionary per data row: header text -> cell text. Row 1 is the header.
    // Rows with no values are skipped. Numbers come back as plain text ("9913730753", "13500").
    public static List<Dictionary<string, string>> ReadFirstSheet(Stream xlsx)
    {
        using var zip = new ZipArchive(xlsx, ZipArchiveMode.Read);
        XNamespace main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        XNamespace rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        XNamespace pkgRel = "http://schemas.openxmlformats.org/package/2006/relationships";

        XDocument Load(string path) => XDocument.Load((zip.GetEntry(path) ?? throw new InvalidDataException($"Not a valid .xlsx file (missing {path}).")).Open());

        var firstSheet = Load("xl/workbook.xml").Descendants(main + "sheet").FirstOrDefault()
                         ?? throw new InvalidDataException("The workbook has no sheets.");
        var relId = (string?)firstSheet.Attribute(rel + "id");
        var target = Load("xl/_rels/workbook.xml.rels").Descendants(pkgRel + "Relationship")
            .First(r => (string?)r.Attribute("Id") == relId).Attribute("Target")!.Value.TrimStart('/');
        var sheetPath = target.StartsWith("xl/") ? target : "xl/" + target;

        // Shared strings: a cell with t="s" holds an index into this list.
        var shared = new List<string>();
        if (zip.GetEntry("xl/sharedStrings.xml") is not null)
            shared = Load("xl/sharedStrings.xml").Descendants(main + "si")
                .Select(si => string.Concat(si.Descendants(main + "t").Select(t => t.Value))).ToList();

        var rows = new List<Dictionary<int, string>>();
        foreach (var row in Load(sheetPath).Descendants(main + "row"))
        {
            var cells = new Dictionary<int, string>();
            foreach (var c in row.Elements(main + "c"))
            {
                var col = ColumnIndex((string?)c.Attribute("r") ?? "");
                var type = (string?)c.Attribute("t");
                string? text = type switch
                {
                    "s" => int.TryParse(c.Element(main + "v")?.Value, out var i) && i < shared.Count ? shared[i] : null,
                    "inlineStr" => string.Concat(c.Descendants(main + "t").Select(t => t.Value)),
                    _ => c.Element(main + "v")?.Value
                };
                if (!string.IsNullOrWhiteSpace(text)) cells[col] = text.Trim();
            }
            rows.Add(cells);
        }

        var header = rows.FirstOrDefault(r => r.Count > 0) ?? throw new InvalidDataException("The sheet is empty.");
        var result = new List<Dictionary<string, string>>();
        foreach (var r in rows.SkipWhile(r => r != header).Skip(1))
        {
            if (r.Count == 0) continue;
            result.Add(header.ToDictionary(h => h.Value.ToUpperInvariant(), h => r.GetValueOrDefault(h.Key, "")));
        }
        return result;
    }

    // "A" -> 0, "B" -> 1, "AA" -> 26 (from a cell reference like "AB12").
    private static int ColumnIndex(string cellRef)
    {
        var n = 0;
        foreach (var ch in cellRef.TakeWhile(char.IsLetter)) n = n * 26 + (char.ToUpperInvariant(ch) - 'A' + 1);
        return n - 1;
    }
}
