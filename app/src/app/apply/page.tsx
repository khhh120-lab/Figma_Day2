import {RoutedScreen} from "../../components/screens";
export default async function Page({searchParams}:{searchParams:Promise<{plan?:string}>}){const {plan}=await searchParams;return <RoutedScreen screen="apply" planId={plan}/>;}
