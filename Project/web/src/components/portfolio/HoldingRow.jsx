export default function HoldingRow({ holding }) {
  return (
    <tr className="border-b">
      <td className="p-2">{holding.symbol}</td>
      <td className="p-2">{holding.qty}</td>
      <td className="p-2">{holding.avgPrice}</td>
    </tr>
  );
}