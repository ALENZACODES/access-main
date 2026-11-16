import { Diary } from "@access-tools/diary";
import { PackageView } from "./PackageView";

export default function DiaryPage() {
  return <PackageView page="diary" component={Diary} />;
}
