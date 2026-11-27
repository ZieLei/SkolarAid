// =====================================================================
// ScholarshipCatalog.cs - common scholarships in the Philippines.
//
// On every start, DbSeeder adds any of these that are missing from the
// scholarship_types table (matched by name, ignoring upper/lower case),
// so admins can simply type or pick them in the scholar form.
//
// Stipend amounts: only programs with a well-known, fixed amount get one.
// The rest start at 0 ("amount not set"); the admin sets the real amount
// in Scholar Management > Manage scholarships before paying anyone.
// Amounts change over time - check them against the latest memorandum.
// =====================================================================
namespace IskolarAid.Core.Services;

public static class ScholarshipCatalog
{
    // How often a scholarship can pay. Used by the forms and the API checks.
    public static readonly string[] Frequencies = ["Monthly", "Quarterly", "Semi-Annual", "Annual"];

    public sealed record Entry(
        string Name,
        string FundSource,
        decimal Stipend,
        string Frequency,
        string Description
    );

    public static readonly Entry[] Entries =
    [
        // ---- Government: CHED / UniFAST ----
        new(
            "CHED Merit Scholarship Program (CMSP)",
            "Government",
            0,
            "Semi-Annual",
            "CHED merit scholarship for students with high grades (full or half merit)."
        ),
        new(
            "CHED Tulong Dunong Program (TDP)",
            "Government",
            7500,
            "Semi-Annual",
            "UniFAST grant of P15,000 per school year, paid P7,500 per semester."
        ),
        new(
            "Tertiary Education Subsidy (TES)",
            "Government",
            13500,
            "Semi-Annual",
            "CHED UniFAST subsidy. P13,500 per semester per the 2nd sem 2025-26 grantee list."
        ),
        new(
            "Expanded Students' Grants-in-Aid Program for Poverty Alleviation (ESGP-PA)",
            "Government",
            0,
            "Semi-Annual",
            "CHED / DSWD grant for students from poor households."
        ),
        new(
            "CHED Scholarship Program for Coconut Farmers and their Families (CoScho)",
            "Government",
            0,
            "Semi-Annual",
            "CHED scholarship for coconut farmers and their children."
        ),
        new(
            "CHED Sugarcane Industry Development Act Scholarship (SIDA-SGP)",
            "Government",
            0,
            "Semi-Annual",
            "CHED grant for sugarcane workers and their families."
        ),
        new(
            "CHED Special Study Grant for Indigenous Peoples",
            "Government",
            0,
            "Semi-Annual",
            "CHED grant for members of Indigenous Peoples communities."
        ),
        new(
            "DA-CHED Agri-Fishery Scholarship (ACEF-GIAS)",
            "Government",
            0,
            "Semi-Annual",
            "Grant for agriculture and fishery students."
        ),
        // ---- Government: DOST ----
        new(
            "DOST-SEI Merit Scholarship",
            "Government",
            8000,
            "Monthly",
            "DOST science and technology scholarship; monthly stipend."
        ),
        new(
            "DOST-SEI RA 7687 Scholarship",
            "Government",
            8000,
            "Monthly",
            "DOST scholarship for talented students from low-income families; monthly stipend."
        ),
        new(
            "DOST-SEI Junior Level Science Scholarship (JLSS)",
            "Government",
            8000,
            "Monthly",
            "DOST scholarship for 3rd year science and math students; monthly stipend."
        ),
        // ---- Government: other agencies ----
        new(
            "OWWA Education for Development Scholarship Program (EDSP)",
            "Government",
            30000,
            "Semi-Annual",
            "OWWA scholarship for children of OFWs: up to P60,000 per school year."
        ),
        new(
            "OWWA OFW Dependent Scholarship Program (ODSP)",
            "Government",
            10000,
            "Semi-Annual",
            "OWWA grant for dependents of OFWs: P20,000 per school year."
        ),
        new(
            "GSIS Scholarship Program",
            "Government",
            0,
            "Semi-Annual",
            "GSIS scholarship for children of members."
        ),
        new(
            "Landbank Gawad Patnubay Scholarship",
            "Government",
            0,
            "Semi-Annual",
            "Landbank scholarship for children of agrarian reform beneficiaries."
        ),
        new(
            "Provincial / LGU Scholarship",
            "Government",
            0,
            "Semi-Annual",
            "Scholarship from the province, city or municipality."
        ),
        // ---- Private and school ----
        new(
            "SM Foundation College Scholarship",
            "Private",
            0,
            "Monthly",
            "SM Foundation scholarship with tuition and monthly allowance."
        ),
        new(
            "Gokongwei Brothers Foundation Scholarship",
            "Private",
            0,
            "Semi-Annual",
            "Scholarship for STEM and education students."
        ),
        new(
            "Megaworld Foundation Scholarship",
            "Private",
            0,
            "Semi-Annual",
            "Megaworld Foundation college scholarship."
        ),
        new(
            "Institutional Academic Scholarship",
            "Private",
            0,
            "Semi-Annual",
            "The school's own scholarship for students with high grades."
        ),
        new(
            "Institutional Financial Assistance Grant",
            "Private",
            0,
            "Semi-Annual",
            "The school's own grant for students who need financial help."
        ),
        new(
            "Athletic / Varsity Scholarship",
            "Private",
            0,
            "Semi-Annual",
            "Scholarship for school athletes."
        ),
    ];
}
