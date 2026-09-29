import { useI18n } from "../i18n/context";

export interface TableRow {
  key: number;
  time: string;
  value: string;
}

/** Table view of a card - the same data as the chart, readable without hovering. */
export function ReadingsTable({ rows, valueHeader }: { rows: TableRow[]; valueHeader: string }) {
  const { t } = useI18n();
  return (
    <div className="table-wrap" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">{t("time")}</th>
            <th scope="col">{valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.time}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
